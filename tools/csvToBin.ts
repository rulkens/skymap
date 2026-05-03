/**
 * SDSS CSV → .bin conversion CLI.
 *
 * Thin wrapper around `parseSdssCsv` (in `tools/parsers/sdssCsv.ts`) plus the
 * binary point-cloud writer in `src/data/pointCloudFormat.ts`. Converts a CSV
 * downloaded from the SDSS SkyServer
 * (https://skyserver.sdss.org/dr18/SearchTools/sql) into the project's binary
 * point-cloud format (`SKMP` v2).
 *
 * Usage:
 *   npm run csv-to-bin -- <input.csv> <output.bin>
 *
 * Why is parsing in a separate module?
 *   The future `tools/buildAllBins.ts` will need to ingest four catalogs
 *   (SDSS, 2MRS, 2MPZ, 6dFGS) before merging them. Splitting parsing out of
 *   this CLI lets each parser live next to its survey-specific peers in
 *   `tools/parsers/`, while this file stays focused on what the CLI itself
 *   actually does: read a file, convert RA/Dec/z to Cartesian, and write
 *   the binary.
 *
 * Why Node + tsx rather than a browser bundle?
 *   SDSS exports can be hundreds of megabytes. Doing the conversion once on
 *   the command line keeps the browser load lean: it only fetches the
 *   compact `.bin`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { raDecZToCartesian } from '../src/utils/math/index.js';
import { encodePointCloud } from '../src/data/pointCloudFormat.js';
import type { PointCloud } from '../src/@types/index.js';
import { parseSdssCsv } from './parsers/sdssCsv.js';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length !== 2) {
  process.stderr.write('usage: npm run csv-to-bin -- <input.csv> <output.bin>\n');
  process.exit(1);
}

// Non-null assertion is safe: we confirmed args.length === 2 above.
const inputPath = resolve(args[0]!);
const outputPath = resolve(args[1]!);

// ─── CSV loading ──────────────────────────────────────────────────────────────

// `readFileSync` throws if the file is missing or unreadable. We catch it so
// we can emit a clear message instead of a raw Node stack trace.
let rawText: string;
try {
  rawText = readFileSync(inputPath, 'utf8');
} catch (err) {
  process.stderr.write(`error: cannot read "${inputPath}": ${(err as Error).message}\n`);
  process.exit(1);
  // TypeScript doesn't model `process.exit` as `never`, so this unreachable
  // assignment keeps the definite-assignment analysis happy without a cast.
  rawText = '';
}

// ─── Parse ────────────────────────────────────────────────────────────────────

// Delegate the entire decoding step to the SDSS parser. Errors thrown here
// (missing required column, structurally empty CSV) bubble up as a clean
// stack trace with a clear message — those are programmer-facing problems
// rather than bad data, so we don't try to recover.
let records: ReturnType<typeof parseSdssCsv>['records'];
let skipped: number;
try {
  ({ records, skipped } = parseSdssCsv(rawText));
} catch (err) {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
  // Unreachable, but keeps TS's definite-assignment analysis quiet.
  records = [];
  skipped = 0;
}

if (records.length === 0) {
  process.stderr.write('error: no valid rows found after filtering — nothing to write\n');
  process.exit(1);
}

// ─── PointCloud construction ──────────────────────────────────────────────────

const count = records.length;

// Allocate the SoA arrays exactly once. Typed arrays have fixed capacity, so
// pre-sizing avoids any hidden reallocation as we fill them in below.
// TODO Task 4+ (galaxy-orientation-disks): wire SDSS PhotoObj's b/a + phi
// columns through `parseSdssCsv` and into axisRatio + positionAngleDeg
// here. Initialised to NaN for now so the v3 encoder gets a fully-shaped
// PointCloud and the "no measurement" sentinel propagates end-to-end.
const cloud: PointCloud = {
  count,
  objIDs: new BigUint64Array(count), // SDSS object identifiers
  positions: new Float32Array(count * 3), // (x, y, z) in Mpc per point
  magU: new Float32Array(count), // u-band apparent magnitude
  magG: new Float32Array(count), // g-band apparent magnitude
  magR: new Float32Array(count), // r-band apparent magnitude
  magI: new Float32Array(count), // i-band apparent magnitude
  magZ: new Float32Array(count), // z-band apparent magnitude
  axisRatio: new Float32Array(count).fill(NaN), // b/a — TODO Task 4+
  positionAngleDeg: new Float32Array(count).fill(NaN), // PA in deg — TODO Task 4+
};

for (let i = 0; i < count; i++) {
  // `records[i]` is `ParsedRecord | undefined` under noUncheckedIndexedAccess.
  // We know it's defined because i < count === records.length, so `!` is safe.
  const r = records[i]!;

  // Convert sky position + redshift to 3D Cartesian coordinates in Mpc.
  // raDecZToCartesian returns a three-tuple [x, y, zCart].
  const [x, y, zCart] = raDecZToCartesian(r.ra, r.dec, r.z);

  cloud.objIDs[i] = r.objID;
  cloud.positions[i * 3 + 0] = x;
  cloud.positions[i * 3 + 1] = y;
  cloud.positions[i * 3 + 2] = zCart;

  // Store each photometric band directly — the renderer will derive colour
  // indices (e.g. u−g) from magU and magG at upload time, not here.
  cloud.magU[i] = r.magU;
  cloud.magG[i] = r.magG;
  cloud.magR[i] = r.magR;
  cloud.magI[i] = r.magI;
  cloud.magZ[i] = r.magZ;
}

// ─── Encode & write ───────────────────────────────────────────────────────────

const buffer = encodePointCloud(cloud);

try {
  // Node's `writeFileSync` accepts an `ArrayBuffer` directly since Node 16.
  writeFileSync(outputPath, Buffer.from(buffer));
} catch (err) {
  process.stderr.write(`error: cannot write "${outputPath}": ${(err as Error).message}\n`);
  process.exit(1);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

// Format integers with locale-aware thousands separators for readability
// (e.g. 487213 → "487,213"). `toLocaleString('en-US')` is consistent across
// Node versions and doesn't depend on the system locale.
const fmtN = (n: number) => n.toLocaleString('en-US');

console.log(`wrote ${fmtN(count)} points to ${outputPath} (${fmtN(buffer.byteLength)} bytes)`);
console.log(`skipped ${fmtN(skipped)} rows (z <= 0 or missing fields)`);
