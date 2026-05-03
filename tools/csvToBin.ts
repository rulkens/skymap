/**
 * SDSS CSV → .bin conversion tool.
 *
 * Converts a CSV downloaded from the SDSS SkyServer
 * (https://skyserver.sdss.org/dr18/SearchTools/sql) into the project's binary
 * point-cloud format (`SKMP` v1, see `src/data/pointCloudFormat.ts`).
 *
 * Usage:
 *   npm run csv-to-bin -- <input.csv> <output.bin>
 *
 * The CSV must have a header row with (at minimum) these columns, in any order,
 * case-insensitive: `ra`, `dec`, `z`, `modelMag_g`, `modelMag_u`.
 * Any extra columns are silently ignored.
 *
 * Rows are skipped when:
 *   - `z <= 0`  (stars or objects with bad/missing redshift measurements)
 *   - Any required field is empty or parses as NaN.
 *
 * Why Node + tsx rather than a browser bundle?
 *   SDSS exports can be hundreds of megabytes. Doing the conversion once on the
 *   command line keeps the browser load lean: it only fetches the compact `.bin`.
 *
 * Why write our own tiny CSV parser instead of a library?
 *   SDSS CSV exports use plain comma-separated values — no quoted fields
 *   containing commas, no embedded newlines. A `line.split(',')` is all we need,
 *   and avoiding a dependency keeps the tooling surface minimal.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { raDecZToCartesian } from '../src/data/coords.js';
import { encodePointCloud } from '../src/data/pointCloudFormat.js';
import type { PointCloud } from '../src/types.js';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length !== 2) {
  process.stderr.write(
    'usage: npm run csv-to-bin -- <input.csv> <output.bin>\n',
  );
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

// Split into non-empty lines. We normalise Windows-style CRLF → LF first so
// that headers and cells don't end up with a trailing `\r`.
const lines = rawText.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');

if (lines.length < 2) {
  process.stderr.write('error: CSV has no data rows (need at least a header + one data row)\n');
  process.exit(1);
}

// ─── Header parsing ───────────────────────────────────────────────────────────

// The first line is always the header. Trim whitespace from each column name
// and normalise to lowercase so the lookup below is case-insensitive.
const headerLine = lines[0]!;
const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

/**
 * Find the 0-based column index for a required column name.
 * Exits with an error if the column is not present, so the rest of the code
 * can safely use the returned index without further null checks.
 */
function requireColumn(name: string): number {
  const idx = headers.indexOf(name.toLowerCase());
  if (idx === -1) {
    process.stderr.write(`error: required column "${name}" not found in CSV header\n`);
    process.stderr.write(`       found columns: ${headers.join(', ')}\n`);
    process.exit(1);
  }
  return idx;
}

const COL_RA = requireColumn('ra');
const COL_DEC = requireColumn('dec');
const COL_Z = requireColumn('z');
const COL_MAG_G = requireColumn('modelMag_g');
const COL_MAG_U = requireColumn('modelMag_u');

// ─── Row parsing ──────────────────────────────────────────────────────────────

/**
 * One parsed galaxy row — holds the five values we actually use downstream.
 * Using a `type` alias rather than an `interface` per project conventions.
 */
type ParsedRow = {
  ra: number;
  dec: number;
  z: number;
  magG: number;
  magU: number;
};

const rows: ParsedRow[] = [];
let skipped = 0;

// `lines[0]` is the header; data starts at index 1.
for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx]!;
  const cells = line.split(',').map(c => c.trim());

  // Pull out the five required fields. With `noUncheckedIndexedAccess` each
  // `cells[idx]` is `string | undefined`, so we coerce undefined → '' before
  // passing to parseFloat — parseFloat('') → NaN, which the filter below catches.
  const ra   = parseFloat(cells[COL_RA]   ?? '');
  const dec  = parseFloat(cells[COL_DEC]  ?? '');
  const z    = parseFloat(cells[COL_Z]    ?? '');
  const magG = parseFloat(cells[COL_MAG_G] ?? '');
  const magU = parseFloat(cells[COL_MAG_U] ?? '');

  // Skip bad rows: non-physical redshifts (z ≤ 0 means a star, a QSO at
  // z=0, or a catalogue error) and any field that failed to parse.
  if (z <= 0 || isNaN(ra) || isNaN(dec) || isNaN(z) || isNaN(magG) || isNaN(magU)) {
    skipped++;
    continue;
  }

  rows.push({ ra, dec, z, magG, magU });
}

if (rows.length === 0) {
  process.stderr.write('error: no valid rows found after filtering — nothing to write\n');
  process.exit(1);
}

// ─── PointCloud construction ──────────────────────────────────────────────────

const count = rows.length;

// Allocate the three SoA arrays exactly once. No push() — typed arrays have
// fixed capacity, and pre-sizing avoids any hidden reallocation.
const positions  = new Float32Array(count * 3); // (x, y, z) in Mpc per point
const magnitudes = new Float32Array(count);      // g-band apparent magnitude
const colorIndex = new Float32Array(count);      // u−g color index

for (let i = 0; i < count; i++) {
  // `rows[i]` is `ParsedRow | undefined` under noUncheckedIndexedAccess.
  // We know it's defined because i < count === rows.length, so `!` is safe.
  const { ra, dec, z, magG, magU } = rows[i]!;

  // Convert sky position + redshift to 3D Cartesian coordinates in Mpc.
  // raDecZToCartesian returns a three-tuple [x, y, z_cart].
  const [x, y, zCart] = raDecZToCartesian(ra, dec, z);
  positions[i * 3 + 0] = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = zCart;

  // g-band magnitude maps directly to point brightness in the shader.
  magnitudes[i] = magG;

  // u−g: the difference between the u-band and g-band magnitudes.
  // Bluer star-forming galaxies have lower u−g (≈0.8–1.2);
  // redder quiescent ellipticals have higher u−g (≈1.6–2.2).
  colorIndex[i] = magU - magG;
}

const cloud: PointCloud = { count, positions, magnitudes, colorIndex };

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
