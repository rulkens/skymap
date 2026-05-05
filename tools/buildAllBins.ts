#!/usr/bin/env node
/**
 * buildAllBins — cross-match three real catalogues and write one v2 .bin per source.
 *
 * Usage:
 *   npm run build-all -- \
 *     --sdss    path/to/sdss.csv \
 *     --twomrs  path/to/2mrs_table3.dat \
 *     --glade   path/to/glade2.3.dat \
 *     --out-dir public/data
 *
 * Output files: sdss.bin, 2mrs.bin, glade.bin (one per source).
 *
 * Cross-match dedup:
 *   - Priority: SDSS > 2MRS > GLADE. See `tools/crossMatch.ts` for the
 *     full algorithm and tolerances.
 *   - GLADE is itself a pre-merged catalogue (2MPZ + 2MASS XSC + HyperLEDA
 *     + GWGC + 6dFGS + SDSS-DR12Q), so we only need to dedup it against
 *     SDSS and against 2MRS — not against its own constituents.
 *
 * Why are `crossMatch` and the CLI in different files?
 *   This wrapper imports `node:fs`, `node:path`, `node:url`. The main
 *   `tsconfig.json` deliberately excludes `tools/` and does not pull in
 *   `@types/node`, so a test under `tests/` that transitively imported
 *   Node APIs would fail typecheck. Keeping the dedup logic in
 *   `tools/crossMatch.ts` (Node-free) lets `tests/crossMatch.test.ts`
 *   exercise it without dragging Node types into the browser-side build.
 *   This module re-exports `crossMatch` so callers (and the test) can
 *   keep importing it from the `buildAllBins` path the plan specifies.
 */
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { parseSdssCsv } from './parsers/sdssCsv.js';
import { parseTwoMrs, parseXscShapeCsv } from './parsers/twoMrs.js';
import type { XscShapeMap } from './parsers/twoMrs.js';
import { parseGladeLine, parseHyperLedaCsv } from './parsers/glade.js';
import type { HyperLedaShapeMap } from './parsers/glade.js';
import type { ParsedRecord } from './parsers/common.js';
import { crossMatch } from './crossMatch.js';

import { encodePointCloud } from '../src/data/pointCloudFormat.js';
import { raDecZToCartesian } from '../src/utils/math/index.js';
import { fallbackOrientation } from '../src/utils/random/fallbackOrientation.js';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../src/utils/math/galaxyDiameterKpc.js';
import { Source } from '../src/data/sources.js';
import type { PointCloud } from '../src/@types/index.js';
import { TIER_TARGETS, tierFilenameForSource } from '../src/data/tierTargets.js';
import type { Tier } from '../src/@types/Tier.js';
import { subsampleByAbsMag } from './subsampleByAbsMag.js';

// Re-export so `tests/crossMatch.test.ts` and any other consumer can keep
// using the documented `tools/buildAllBins` import path.
export { crossMatch } from './crossMatch.js';
export type { CrossMatchInputs } from './crossMatch.js';

// ─── PointCloud assembly + write ─────────────────────────────────────────────

/**
 * Materialise a survey-specific subset of merged records into the SoA
 * `PointCloud` shape the binary encoder expects.
 *
 * Allocating each typed array exactly once at the known final size keeps
 * the hot fill loop tight — no per-row push() overhead, no hidden
 * reallocations, and the resulting buffers are GPU-upload-ready.
 */
function recordsToCloud(records: ParsedRecord[]): PointCloud {
  const count = records.length;
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    // `records[i]` is `ParsedRecord | undefined` under noUncheckedIndexedAccess.
    // We loop with i < count === records.length, so the `!` is safe.
    const r = records[i]!;
    const [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);
    cloud.objIDs[i] = r.objID;
    cloud.positions[i * 3 + 0] = x;
    cloud.positions[i * 3 + 1] = y;
    cloud.positions[i * 3 + 2] = z;
    cloud.magU[i] = r.magU;
    cloud.magG[i] = r.magG;
    cloud.magR[i] = r.magR;
    cloud.magI[i] = r.magI;
    cloud.magZ[i] = r.magZ;
    // Orientation: prefer the parser-supplied real value (SDSS PhotoObj for
    // SDSS, 2MASS XSC for 2MRS, HyperLEDA for GLADE). When the parser
    // emitted `null` for either field — meaning the survey simply doesn't
    // have a measurement for that galaxy — fall back to the deterministic
    // hash-based orientation so every encoded point has a finite (axisRatio,
    // PA) pair. The hash uses (objID, ra, dec) so reload yields the same
    // tilt every time.
    if (r.axisRatio !== null && r.positionAngleDeg !== null) {
      cloud.axisRatio[i] = r.axisRatio;
      cloud.positionAngleDeg[i] = r.positionAngleDeg;
    } else {
      const fb = fallbackOrientation(r.objID, r.ra, r.dec);
      cloud.axisRatio[i] = fb.axisRatio;
      cloud.positionAngleDeg[i] = fb.positionAngleDeg;
    }
    // Diameter: prefer the parser-supplied real measurement (2MRS Riso,
    // GLADE Tully(Bmag), SDSS petroR50_r).  When the parser couldn't
    // extract a real value, fall back to DEFAULT_GALAXY_DIAMETER_KPC = 30
    // so the encoded cloud always carries a finite, positive diameter.
    //
    // Why apply the fallback here rather than inside each parser?  Three
    // reasons: (1) a single source-of-truth for the default value, (2)
    // future Phase-2 plans (HyperLEDA logd25) can swap the fallback to a
    // pgc-keyed lookup without touching every parser, and (3) the
    // null/finite distinction at the parser boundary doubles as the
    // provenance signal for the InfoCard's "real / Tully / fallback"
    // chip in Task 14.
    cloud.diameterKpc[i] =
      r.diameterKpc !== null && r.diameterKpc > 0 ? r.diameterKpc : DEFAULT_GALAXY_DIAMETER_KPC;
  }
  return cloud;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

type ParserFn = (raw: string) => { records: ParsedRecord[]; skipped: number };

/**
 * Find the most recently modified `Skyserver_*.csv` in the given directory.
 *
 * SkyServer's web export names every download with a timestamped filename
 * (e.g. `Skyserver_CrossID5_3_2026 7_59_27 PM.csv`), so when the user
 * downloads a new pull the previous one stays on disk under a different
 * name.  Hard-coding any single filename in `package.json`'s `build-all`
 * script meant new downloads were silently ignored unless someone updated
 * the script — exactly the regression that put 30 kpc fallbacks on every
 * SDSS row even though `petroR50_r` was right there.
 *
 * Strategy: glob `Skyserver_*.csv`, sort by mtime descending, return the
 * first entry's path.  Returns undefined when the directory has no match,
 * letting the caller print a clear "missing input" error.
 *
 * Why mtime rather than parsing the filename?  The SkyServer naming
 * scheme has shifted twice already (CrossID vs SQL prefixes, locale-
 * dependent AM/PM markers); mtime is the one signal that's portable
 * across all of them.
 */
function findLatestSdssCsv(dir: string): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  const matches = entries
    .filter((name) => name.startsWith('Skyserver_') && name.endsWith('.csv'))
    .map((name) => {
      const full = join(dir, name);
      const mtime = statSync(full).mtimeMs;
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.full;
}

/**
 * Parse `--key value` pairs into a flat record. Order is irrelevant; missing
 * flags surface as `undefined` keys at the call site rather than throwing
 * here, so the caller can decide which flags are required.
 */
function readArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

/**
 * Load a catalog file if a path was supplied; otherwise return an empty
 * record list. Returning `[]` for missing inputs (rather than erroring)
 * lets the CLI run a partial build — e.g. only SDSS + 2MRS while we wait
 * for the GLADE download — which is handy during pipeline development.
 */
function loadOrEmpty(path: string | undefined, parser: ParserFn): ParsedRecord[] {
  if (!path) return [];
  const text = readFileSync(resolve(path), 'utf8');
  const { records, skipped } = parser(text);
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

/**
 * Streaming variant of `loadOrEmpty` for the GLADE catalog.
 *
 * Why a separate code path for GLADE? The released v2.3 file is ~800 MB.
 * V8 caps each JavaScript string at ~512 MB (`ERR_STRING_TOO_LONG`), so a
 * single `readFileSync(..., 'utf8')` throws before we get a chance to
 * parse anything. Streaming the file through `readline` reads it in
 * 64 KB chunks and surfaces complete lines, which we feed through
 * `parseGladeLine` one at a time — the same row-filter logic the
 * all-at-once `parseGlade` uses, just without the giant string in the
 * middle.
 *
 * SDSS and 2MRS comfortably fit under the string cap (~45 MB and ~10 MB
 * respectively), so they keep the simpler `readFileSync` path.
 */
async function loadGladeStream(
  path: string | undefined,
  options: { specZOnly?: boolean; isotropic?: boolean } = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): Promise<ParsedRecord[]> {
  if (!path) return [];

  const records: ParsedRecord[] = [];
  let skipped = 0;

  // crlfDelay: Infinity tells readline to treat \r\n as a single line
  // terminator — important on Windows-converted catalog dumps. The
  // chunked reader transparently handles UTF-8 byte-boundary issues.
  const rl = createInterface({
    input: createReadStream(resolve(path)),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.length === 0) continue;
    const rec = parseGladeLine(line, options, hyperLeda);
    if (rec === null) {
      skipped++;
    } else {
      records.push(rec);
    }
  }

  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

/**
 * The CLI entry point. Kept in its own function so that importing this
 * module from a test does not trigger argv parsing or `process.exit`.
 *
 * Async because the GLADE loader is streaming — see `loadGladeStream`.
 */
async function runCli(): Promise<void> {
  const args = readArgs();

  // Reasonable defaults so `npm run build-all` works with no flags after
  // the user drops fresh catalog files into the canonical paths:
  //   - SDSS: newest `data/Skyserver_*.csv` by mtime (auto-picked)
  //   - 2MRS: `data/raw/2mrs_table3.dat` (filename is stable on Vizier)
  //   - GLADE: `data/raw/glade2.3.dat` (likewise)
  //   - out-dir: `public/data` (Vite serves this at /data/* in the browser)
  // Each can be overridden with the matching --key flag.
  const sdssArg = args.sdss || findLatestSdssCsv(resolve('data')) || '';
  const twomrsArg = args.twomrs || 'data/raw/2mrs_table3.dat';
  const gladeArg = args.glade || 'data/raw/glade2.3.dat';
  const outDirArg = args['out-dir'] || 'public/data';

  if (sdssArg) {
    process.stderr.write(
      `SDSS source: ${sdssArg}${args.sdss ? '' : '  (auto-detected, latest by mtime)'}\n`,
    );
  } else {
    process.stderr.write(
      'warning: no SDSS CSV supplied AND no Skyserver_*.csv found in data/ — SDSS bin will be empty\n',
    );
  }

  // Re-bind the args record so the rest of the function (which still reads
  // args.sdss, args.twomrs, etc.) sees the resolved paths uniformly.
  args.sdss = sdssArg;
  args.twomrs = twomrsArg;
  args.glade = gladeArg;
  args['out-dir'] = outDirArg;

  // `--glade-spec-only` is a value-less boolean flag; readArgs() consumed the
  // next argv entry into its value, but the presence of the key is what we
  // care about.  Treat any non-empty key occurrence as opt-in.
  const gladeSpecOnly = 'glade-spec-only' in args;
  if (gladeSpecOnly) {
    process.stderr.write(
      'GLADE filter: spec-z only (drops 2MPZ photo-z entries to reveal filaments)\n',
    );
  }

  // `--glade-isotropic`: drop rows whose only parent catalogue is SDSS-DR12,
  // which covers ~1/3 of the sky and otherwise creates pencil-beam radial
  // "jets" beyond ~600 Mpc.  Independent of `--glade-spec-only`; user can
  // enable either, both, or neither.  We use `process.argv.includes` here
  // rather than `'glade-isotropic' in args` because the previous-flag
  // treatment is itself a quirk of `readArgs` consuming the next argv slot,
  // and the argv-includes check is the more direct "is the flag set?" test.
  const gladeIsotropic = process.argv.includes('--glade-isotropic');
  if (gladeIsotropic) {
    process.stderr.write(
      'GLADE filter: isotropic (drops SDSS-DR12-only rows to remove pencil-beam jets)\n',
    );
  }

  // Load the optional orientation caches before any parsing kicks off.
  // Both files are produced by separate `tools/fetch*.ts` scripts and may
  // not yet exist on a fresh checkout — that's intentional. A missing cache
  // simply means every 2MRS / GLADE row in this build will fall through to
  // the deterministic `fallbackOrientation` in `recordsToCloud` below; the
  // pipeline keeps working, just with hash-derived disk tilts instead of
  // measured ones. We log loud warnings rather than silently substituting,
  // so the operator sees exactly what they're getting.
  const xscPath = resolve('data/raw/2mass_xsc_pa.csv');
  let xsc: XscShapeMap = new Map();
  try {
    xsc = parseXscShapeCsv(readFileSync(xscPath, 'utf8'));
    process.stderr.write(`loaded ${xsc.size.toLocaleString()} 2MASS XSC orientations\n`);
  } catch {
    process.stderr.write(`warning: ${xscPath} not present — 2MRS orientation = fallback only\n`);
  }

  const ledaPath = resolve('data/raw/hyperleda_pa.csv');
  let leda: HyperLedaShapeMap = new Map();
  try {
    leda = parseHyperLedaCsv(readFileSync(ledaPath, 'utf8'));
    process.stderr.write(`loaded ${leda.size.toLocaleString()} HyperLEDA orientations\n`);
  } catch {
    process.stderr.write(`warning: ${ledaPath} not present — GLADE orientation = fallback only\n`);
  }

  process.stderr.write('parsing SDSS…\n');
  const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
  process.stderr.write('parsing 2MRS…\n');
  const twoMrs = loadOrEmpty(args.twomrs, (raw) => parseTwoMrs(raw, xsc));
  process.stderr.write('parsing GLADE (streaming)…\n');
  const glade = await loadGladeStream(
    args.glade,
    { specZOnly: gladeSpecOnly, isotropic: gladeIsotropic },
    leda,
  );

  // Capture per-source input counts up front so the summary can report
  // the dedup drop rate per survey, not just the merged total.
  const inputCounts: Record<number, number> = {
    [Source.SDSS]: sdss.length,
    [Source.TwoMRS]: twoMrs.length,
    [Source.Glade]: glade.length,
  };

  process.stderr.write('cross-matching…\n');
  const merged = crossMatch({ sdss, twoMrs, glade });
  process.stderr.write(`  ${merged.length.toLocaleString()} records survived dedup\n`);

  // Bucket the merged stream back out per source so we can write one
  // file per survey. Using a Map preserves insertion order, which keeps
  // the log output tidy.
  const bySource = new Map<Source, ParsedRecord[]>();
  for (const r of merged) {
    let arr = bySource.get(r.source);
    if (!arr) {
      arr = [];
      bySource.set(r.source, arr);
    }
    arr.push(r);
  }

  // Per-source dedup report. Subtracting kept from input gives the number
  // of records dropped as duplicates of a higher-priority survey's row.
  for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade]) {
    const kept = (bySource.get(source) ?? []).length;
    const input = inputCounts[source] ?? 0;
    const dropped = input - kept;
    process.stderr.write(
      `  ${Source[source]}: ${input.toLocaleString()} in → ${kept.toLocaleString()} kept, ${dropped.toLocaleString()} dropped as duplicate\n`,
    );
  }

  const outDir = args['out-dir']!;
  const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

  // Track filenames already written this run so the tier-agnostic sources
  // (2MRS, Famous) are only encoded + flushed once.  `tierFilenameForSource`
  // returns the same string for those across all three tiers, so we'd
  // otherwise rewrite the same bytes three times.
  const written = new Set<string>();

  for (const [source, records] of bySource) {
    for (const tier of TIERS) {
      const filename = tierFilenameForSource(source, tier);
      if (written.has(filename)) continue;
      written.add(filename);

      // Apply the tier's per-source target, if any.  Missing key = no cap.
      // 0 = exclude (skip writing this file entirely so the runtime can
      // detect "no data for this tier" via 404 rather than an empty cloud).
      const target = TIER_TARGETS[tier][source];
      if (target === 0) {
        process.stderr.write(`tier ${tier}: ${Source[source]} excluded — skipping ${filename}\n`);
        continue;
      }
      const slice = target === undefined ? records : subsampleByAbsMag(records, target);

      const cloud = recordsToCloud(slice);
      const buf = encodePointCloud(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );
    }
  }
}

// Only run the CLI when this file is invoked directly (e.g. via tsx).
// When vitest imports the module to pull `crossMatch` out for testing,
// `import.meta.url` and the resolved argv[1] differ, so the CLI stays
// dormant. fileURLToPath normalises the URL form Node uses internally
// to a plain absolute path that matches argv[1].
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  // Top-level await is permitted under module: ESNext, but wrapping in a
  // promise chain keeps Node from converting an unhandled rejection into a
  // silent exit-0 on older versions.
  runCli().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
