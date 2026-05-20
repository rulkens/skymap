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
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { parseSdssCsv } from '../parsers/sdssCsv.js';
import { parseTwoMrs, parseXscShapeCsv } from '../parsers/twoMrs.js';
import type { XscShapeMap } from '../parsers/twoMrs.js';
import { parseGladeLine, parseGlade2masxPgcLine, parseHyperLedaCsv } from '../parsers/glade.js';
import type { HyperLedaShapeMap } from '../parsers/glade.js';
import { parseMilliquas } from '../parsers/milliquas.js';
import type { MilliquasParseResult } from '../parsers/milliquas.js';
import type { ParsedRecord } from '../parsers/common.js';
import { crossMatch } from './crossMatch.js';

import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalogFormat.js';
import { raDecZToCartesian } from '../../src/utils/math/index.js';
import { fallbackOrientation } from '../../src/utils/random/fallbackOrientation.js';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../src/utils/math/galaxyDiameterKpc.js';
import { Source, sourceLabel } from '../../src/data/sources.js';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog.js';
import { TIER_TARGETS, tierFilenameForSource } from '../../src/data/tierTargets.js';
import type { Tier } from '../../src/@types/data/Tier.js';
import { subsampleByAbsMag, subsampleIndicesByAbsMag } from './subsampleByAbsMag.js';

// Re-export so `tests/crossMatch.test.ts` and any other consumer can keep
// using the documented `tools/buildAllBins` import path.
export { crossMatch } from './crossMatch.js';
export type { CrossMatchInputs } from './crossMatch.js';

// ─── GalaxyCatalog assembly + write ──────────────────────────────────────────

/**
 * Materialise a survey-specific subset of merged records into the SoA
 * `GalaxyCatalog` shape the binary encoder expects.
 *
 * Allocating each typed array exactly once at the known final size keeps
 * the hot fill loop tight — no per-row push() overhead, no hidden
 * reallocations, and the resulting buffers are GPU-upload-ready.
 */
export function recordsToCloud(records: ParsedRecord[]): GalaxyCatalog {
  const count = records.length;
  const cloud: GalaxyCatalog = {
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
 * Load + parse the Milliquas v8 fixed-width file, preserving the
 * parser's parallel `names`/`classes` sidecars.
 *
 * Why a Milliquas-specific loader rather than another `loadOrEmpty`
 * call? `loadOrEmpty` returns just `ParsedRecord[]` — fine for SDSS /
 * 2MRS / GLADE where the parser's output is fully captured by the
 * record shape, but lossy for Milliquas where the Name + Type[0]
 * columns travel alongside in parallel arrays for the JSON sidecar
 * the InfoCard reads at runtime.  Wrapping the parser here keeps the
 * three sources in lockstep without forcing `ParserFn` to grow a
 * sidecar return shape every parser would have to honour.
 *
 * Missing-file tolerance mirrors `loadOrEmpty`: the raw 194 MB
 * upstream file is gitignored, so a fresh checkout won't have it.
 * We return an empty result so `npm run build-tiers` still produces
 * the SDSS/2MRS/GLADE bins for a contributor who hasn't run the
 * `fetch-milliquas` step yet.
 */
function loadMilliquas(path: string | undefined): MilliquasParseResult {
  const empty: MilliquasParseResult = {
    records: [],
    names: [],
    classes: [],
    skipped: { zMissing: 0, zZero: 0, photoZRounded: 0, qsocRounded: 0 },
  };
  if (!path) return empty;
  const full = resolve(path);
  if (!existsSync(full)) {
    process.stderr.write(`  ${path} not present — Milliquas bin will be empty\n`);
    return empty;
  }
  const text = readFileSync(full, 'utf8');
  const result = parseMilliquas(text);
  const { records, skipped } = result;
  const skippedTotal =
    skipped.zMissing + skipped.zZero + skipped.photoZRounded + skipped.qsocRounded;
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records ` +
      `(skipped ${skippedTotal.toLocaleString()}: ` +
      `z=blank ${skipped.zMissing.toLocaleString()}, ` +
      `z=0 ${skipped.zZero.toLocaleString()}, ` +
      `photo-z ${skipped.photoZRounded.toLocaleString()}, ` +
      `GAIA3 QSOC ${skipped.qsocRounded.toLocaleString()})\n`,
  );
  return result;
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
  // OUT-parameter: GLADE rows with both a real PGC and a real 2MASX name
  // populate this map as a side-effect of the streaming parse.  The
  // 2MRS post-processing pass in runCli below uses it to patch PGCs
  // into 2MRS records' objID slot, so the InfoCard's NED catalogue
  // link can resolve via `?objname=PGC+<n>` instead of the fuzzy
  // near-position-search fallback.
  //
  // Optional so existing tests / callers that don't need the map can
  // omit it without paying the per-row map-write cost.  We populate
  // the map from the *raw line* regardless of whether parseGladeLine
  // accepted or rejected the row — even rows we skip (quasars,
  // no-distance bookkeeping rows) carry valid 2MASX→PGC mappings that
  // a 2MRS row sharing the same XSC cross-ID can legitimately benefit
  // from.  See parseGlade2masxPgcLine's docstring for the full
  // rationale.
  pgcByMassId?: Map<string, bigint>,
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
    // Harvest the 2MASX→PGC mapping from the same line, independently
    // of whether parseGladeLine accepted it as a renderable record.
    // Single-pass over the file keeps the I/O cost flat regardless of
    // whether the caller supplied a map.
    if (pgcByMassId) {
      const pair = parseGlade2masxPgcLine(line);
      if (pair) pgcByMassId.set(pair.massId, pair.pgc);
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
  const milliquasArg = args.milliquas || 'data/raw/milliquas/milliquas.txt';
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
  args.milliquas = milliquasArg;
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
  // 2MASX-name → PGC map, populated as a side effect of the GLADE
  // streaming parse below.  We allocate it in runCli (not inside
  // loadGladeStream) so the post-GLADE 2MRS-patching pass can read it
  // back without a second pass over GLADE's 800 MB file.  Empty when
  // GLADE isn't supplied; the patching loop just no-ops in that case.
  const pgcByMassId = new Map<string, bigint>();

  process.stderr.write('parsing GLADE (streaming)…\n');
  const glade = await loadGladeStream(
    args.glade,
    { specZOnly: gladeSpecOnly, isotropic: gladeIsotropic },
    leda,
    pgcByMassId,
  );

  process.stderr.write('parsing Milliquas…\n');
  const milliquasResult = loadMilliquas(args.milliquas);

  // ── Cross-pollinate PGCs from GLADE into 2MRS ──────────────────────────
  //
  // 2MRS's source file has no PGC column, so its records initially
  // carry `objID = 0n` and the runtime InfoCard's NED catalogue link
  // falls back to a near-position search — which can land on the
  // wrong galaxy in dense fields.  GLADE's source rows DO carry both
  // PGC (bytes 1-7) and the matching 2MASS XSC name (bytes 68-83);
  // `loadGladeStream` populated `pgcByMassId` from those fields above.
  //
  // Walk the parsed 2MRS records once and patch the objID slot
  // whenever GLADE has a corresponding 2MASX→PGC mapping.  Uncovered
  // rows (the long tail — typically <5 % for this nearby-galaxy
  // catalogue, since GLADE was specifically built to merge 2MASS XSC
  // and HyperLEDA) keep `objID = 0n` and continue to use the
  // near-position fallback URL downstream.
  //
  // We rebuild the record via spread rather than mutating the existing
  // object so the change is visible in any future debugging snapshot
  // of `twoMrs[]` taken before this point — and the spread is cheap
  // at 2MRS's scale (~45 k rows total).
  let twoMrsPatched = 0;
  for (let i = 0; i < twoMrs.length; i++) {
    const r = twoMrs[i]!;
    // r.massId is undefined when the 2MRS parser was called from a
    // codepath that didn't set the field (e.g. older tests pre-dating
    // this cross-match) — defensive check, not load-bearing in the
    // CLI path where parseTwoMrs always populates it.
    if (!r.massId) continue;
    const pgc = pgcByMassId.get(r.massId);
    if (pgc !== undefined) {
      twoMrs[i] = { ...r, objID: pgc };
      twoMrsPatched++;
    }
  }
  if (twoMrs.length > 0) {
    const pct = ((twoMrsPatched / twoMrs.length) * 100).toFixed(1);
    process.stderr.write(
      `  2MRS PGC cross-match: ${twoMrsPatched.toLocaleString()} of ${twoMrs.length.toLocaleString()} matched (${pct}%)\n`,
    );
  }

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

  // Milliquas bypasses crossMatch on purpose.  Two reasons:
  //
  // 1. A Milliquas point and a GLADE host galaxy at the same sky
  //    position are physically *different* objects: an AGN core vs the
  //    integrated host emission.  `crossMatch` deduplicates by (RA,
  //    Dec, redshift), so feeding Milliquas through it would discard
  //    real data — exactly the science the catalogue is here to add.
  //
  // 2. Milliquas is pre-deduplicated upstream against every parent
  //    survey it draws from (SDSS, Veron, NED, …), so a second dedup
  //    pass would just spend CPU re-discovering the empty intersection.
  //
  // Add the records straight into the per-source bucket so the per-tier
  // write loop below treats them like any other survey.
  if (milliquasResult.records.length > 0) {
    bySource.set(Source.Milliquas, milliquasResult.records);
  }

  // Per-source dedup report. Subtracting kept from input gives the number
  // of records dropped as duplicates of a higher-priority survey's row.
  for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade]) {
    const kept = (bySource.get(source) ?? []).length;
    const input = inputCounts[source] ?? 0;
    const dropped = input - kept;
    process.stderr.write(
      `  ${sourceLabel(source)}: ${input.toLocaleString()} in → ${kept.toLocaleString()} kept, ${dropped.toLocaleString()} dropped as duplicate\n`,
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
        process.stderr.write(
          `tier ${tier}: ${sourceLabel(source)} excluded — skipping ${filename}\n`,
        );
        continue;
      }
      // Milliquas owns parallel `names`/`classes` sidecars that must
      // reorder/subset in lockstep with the encoded records so the
      // runtime can look up `names[i]` by the same `localIdx` the
      // renderer uses.  We thread the kept-indices through
      // `subsampleIndicesByAbsMag` and re-zip; every other source
      // skips this branch and uses the value-returning variant.
      const isMilliquas = source === Source.Milliquas;
      const keptIndices =
        target === undefined
          ? null
          : isMilliquas
            ? subsampleIndicesByAbsMag(records, target)
            : null;
      const slice =
        target === undefined
          ? records
          : isMilliquas
            ? keptIndices!.map((i) => records[i]!)
            : subsampleByAbsMag(records, target);

      const cloud = recordsToCloud(slice);
      const buf = encodeGalaxyCatalog(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );

      // Milliquas sidecar: parallel-arrayed Name + class letter per
      // encoded record, written exactly once.  The sidecar is
      // tier-agnostic in shape (just JSON) but tier-specific in
      // content because each tier's subsample keeps a different
      // brightest-N slice — so we keep the file independent per tier
      // by suffixing it with the same tier the bin uses.  The
      // runtime fetcher pairs them by `<source>-<tier>.bin` and
      // `<source>-<tier>_names.json`.
      if (isMilliquas) {
        const indices =
          keptIndices ?? milliquasResult.records.map((_, i) => i);
        const names = indices.map((i) => milliquasResult.names[i]!);
        const classes = indices.map((i) => milliquasResult.classes[i]!);
        const sidecarName = filename.replace(/\.bin$/, '_names.json');
        const sidecarPath = resolve(outDir, sidecarName);
        writeFileSync(sidecarPath, JSON.stringify({ names, classes }));
        process.stderr.write(
          `wrote ${names.length.toLocaleString()} names+classes to ${sidecarPath}\n`,
        );
      }
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
