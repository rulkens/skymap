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
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { parseSdssCsv } from './parsers/sdssCsv.js';
import { parseTwoMrs } from './parsers/twoMrs.js';
import { parseGladeLine } from './parsers/glade.js';
import type { ParsedRecord } from './parsers/common.js';
import { crossMatch } from './crossMatch.js';

import { encodePointCloud } from '../src/data/pointCloudFormat.js';
import { raDecZToCartesian } from '../src/utils/math/index.js';
import { Source } from '../src/data/sources.js';
import type { PointCloud } from '../src/@types/index.js';

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
  }
  return cloud;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

type ParserFn = (raw: string) => { records: ParsedRecord[]; skipped: number };

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
async function loadGladeStream(path: string | undefined): Promise<ParsedRecord[]> {
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
    const rec = parseGladeLine(line);
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
  if (!args['out-dir']) {
    process.stderr.write('usage: build-all --sdss FILE --twomrs FILE --glade FILE --out-dir DIR\n');
    process.exit(1);
  }

  process.stderr.write('parsing SDSS…\n');
  const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
  process.stderr.write('parsing 2MRS…\n');
  const twoMrs = loadOrEmpty(args.twomrs, parseTwoMrs);
  process.stderr.write('parsing GLADE (streaming)…\n');
  const glade = await loadGladeStream(args.glade);

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

  // Map each survey to its on-disk filename. We use a Partial<Record<>>
  // because Source.Synthetic has no real catalogue file — synthetic data
  // is generated at runtime.
  const OUT_NAMES: Partial<Record<Source, string>> = {
    [Source.SDSS]: 'sdss.bin',
    [Source.TwoMRS]: '2mrs.bin',
    [Source.Glade]: 'glade.bin',
  };

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
  for (const [source, records] of bySource) {
    const filename = OUT_NAMES[source];
    if (!filename) continue;
    const cloud = recordsToCloud(records);
    const buf = encodePointCloud(cloud);
    const outPath = resolve(outDir, filename);
    writeFileSync(outPath, Buffer.from(buf));
    process.stderr.write(
      `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
    );
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
