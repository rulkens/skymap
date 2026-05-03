/**
 * SDSS CSV → .bin conversion tool.
 *
 * Converts a CSV downloaded from the SDSS SkyServer
 * (https://skyserver.sdss.org/dr18/SearchTools/sql) into the project's binary
 * point-cloud format (`SKMP` v2, see `src/data/pointCloudFormat.ts`).
 *
 * Usage:
 *   npm run csv-to-bin -- <input.csv> <output.bin>
 *
 * The CSV must have a header row with (at minimum) these columns, in any order,
 * case-insensitive:
 *   objID, ra, dec, z, modelMag_u, modelMag_g, modelMag_r, modelMag_i, modelMag_z
 * Any extra columns are silently ignored.
 *
 * Rows are skipped when:
 *   - `z <= 0`  (stars or objects with bad/missing redshift measurements)
 *   - Any of the 5 magnitude columns is empty or parses as NaN.
 *   - `objID` is missing, empty, or fails to parse as a non-zero bigint.
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

import { raDecZToCartesian } from '../src/utils/math/index.js';
import { encodePointCloud } from '../src/data/pointCloudFormat.js';
import type { PointCloud } from '../src/types.js';

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

// Split into non-empty lines. We normalise Windows-style CRLF → LF first so
// that headers and cells don't end up with a trailing `\r`.
//
// SkyServer CSV exports include a leading metadata line like `#Table1` *above*
// the column header. Other tools sometimes prepend SQL comments (`-- query: …`)
// or BOM-prefixed banner lines. We skip both to be permissive — a row that
// begins with `#`, `--`, or is blank is treated as a comment, not data.
const lines = rawText
  .replace(/\r\n/g, '\n')
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return t !== '' && !t.startsWith('#') && !t.startsWith('--');
  });

if (lines.length < 2) {
  process.stderr.write('error: CSV has no data rows (need at least a header + one data row)\n');
  process.exit(1);
}

// ─── Header parsing ───────────────────────────────────────────────────────────

// The first line is always the header. Trim whitespace from each column name
// and normalise to lowercase so the lookup below is case-insensitive.
const headerLine = lines[0]!;
const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

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

const COL_OBJID = requireColumn('objID');
const COL_RA = requireColumn('ra');
const COL_DEC = requireColumn('dec');
const COL_Z = requireColumn('z');
const COL_MAG_U = requireColumn('modelMag_u');
const COL_MAG_G = requireColumn('modelMag_g');
const COL_MAG_R = requireColumn('modelMag_r');
const COL_MAG_I = requireColumn('modelMag_i');
const COL_MAG_Z = requireColumn('modelMag_z');

// ─── Row parsing ──────────────────────────────────────────────────────────────

/**
 * One parsed galaxy row — holds the nine values we actually use downstream.
 * Using a `type` alias rather than an `interface` per project conventions.
 */
type ParsedRow = {
  objID: bigint;
  ra: number;
  dec: number;
  z: number;
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
};

const rows: ParsedRow[] = [];
let skipped = 0;

// `lines[0]` is the header; data starts at index 1.
for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx]!;
  const cells = line.split(',').map((c) => c.trim());

  // Pull out the numeric fields. With `noUncheckedIndexedAccess` each
  // `cells[idx]` is `string | undefined`; we coerce undefined → '' before
  // passing to parseFloat — parseFloat('') → NaN, which the filter catches.
  const ra = parseFloat(cells[COL_RA] ?? '');
  const dec = parseFloat(cells[COL_DEC] ?? '');
  const z = parseFloat(cells[COL_Z] ?? '');
  const magU = parseFloat(cells[COL_MAG_U] ?? '');
  const magG = parseFloat(cells[COL_MAG_G] ?? '');
  const magR = parseFloat(cells[COL_MAG_R] ?? '');
  const magI = parseFloat(cells[COL_MAG_I] ?? '');
  const magZ = parseFloat(cells[COL_MAG_Z] ?? '');

  // Skip bad rows: non-physical redshifts (z ≤ 0 means a star, a QSO at
  // z=0, or a catalogue error) and any numeric field that failed to parse.
  if (
    z <= 0 ||
    isNaN(ra) ||
    isNaN(dec) ||
    isNaN(z) ||
    isNaN(magU) ||
    isNaN(magG) ||
    isNaN(magR) ||
    isNaN(magI) ||
    isNaN(magZ)
  ) {
    skipped++;
    continue;
  }

  // Parse objID as a 64-bit unsigned bigint. `BigInt(s)` throws for empty
  // strings, non-numeric strings, floats (e.g. "1.5"), etc. We catch any
  // parse error and treat the row as bad data. A zero objID is also rejected:
  // SDSS uses 0 as a sentinel for "no object", so it's never a valid ID.
  let objID: bigint;
  try {
    const raw = cells[COL_OBJID] ?? '';
    if (raw === '') {
      skipped++;
      continue;
    }
    objID = BigInt(raw);
    if (objID === 0n) {
      skipped++;
      continue;
    }
  } catch {
    skipped++;
    continue;
  }

  rows.push({ objID, ra, dec, z, magU, magG, magR, magI, magZ });
}

if (rows.length === 0) {
  process.stderr.write('error: no valid rows found after filtering — nothing to write\n');
  process.exit(1);
}

// ─── PointCloud construction ──────────────────────────────────────────────────

const count = rows.length;

// Allocate the SoA arrays exactly once. No push() — typed arrays have fixed
// capacity, and pre-sizing avoids any hidden reallocation.
const objIDs = new BigUint64Array(count); // SDSS object identifiers
const positions = new Float32Array(count * 3); // (x, y, z) in Mpc per point
const magU = new Float32Array(count); // u-band apparent magnitude
const magG = new Float32Array(count); // g-band apparent magnitude
const magR = new Float32Array(count); // r-band apparent magnitude
const magI = new Float32Array(count); // i-band apparent magnitude
const magZ = new Float32Array(count); // z-band apparent magnitude

for (let i = 0; i < count; i++) {
  // `rows[i]` is `ParsedRow | undefined` under noUncheckedIndexedAccess.
  // We know it's defined because i < count === rows.length, so `!` is safe.
  const row = rows[i]!;

  objIDs[i] = row.objID;

  // Convert sky position + redshift to 3D Cartesian coordinates in Mpc.
  // raDecZToCartesian returns a three-tuple [x, y, z_cart].
  const [x, y, zCart] = raDecZToCartesian(row.ra, row.dec, row.z);
  positions[i * 3 + 0] = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = zCart;

  // Store each photometric band directly — the renderer will derive color
  // indices (e.g. u−g) from magU and magG at upload time, not here.
  magU[i] = row.magU;
  magG[i] = row.magG;
  magR[i] = row.magR;
  magI[i] = row.magI;
  magZ[i] = row.magZ;
}

const cloud: PointCloud = { count, objIDs, positions, magU, magG, magR, magI, magZ };

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
