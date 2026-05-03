/**
 * SDSS CSV parser.
 *
 * Turns a raw SDSS SkyServer CSV blob into an array of canonical
 * `ParsedRecord`s (see `common.ts`). This module knows nothing about the
 * binary point-cloud format, file I/O, or downstream merging — it just
 * decodes one specific CSV layout. That separation is what lets the
 * future `buildAllBins.ts` tool reuse this same function alongside parsers
 * for 2MRS, 2MPZ, and 6dFGS.
 *
 * The expected SDSS CSV (downloaded from
 * https://skyserver.sdss.org/dr18/SearchTools/sql) carries a header row
 * with at minimum these columns, in any order, case-insensitive:
 *
 *   objID, ra, dec, z, modelMag_u, modelMag_g, modelMag_r, modelMag_i, modelMag_z
 *
 * Any extra columns are silently ignored — SkyServer often returns query
 * metadata or extra photometric flags depending on how the SQL was written.
 *
 * Why parse against a *column-index map* rather than fixed positions?
 *   The same SDSS query, run on different days or by different users,
 *   can return columns in different orders. Two different SQL queries
 *   that select the same columns are not guaranteed to emit them in the
 *   same order either. Looking each column up by name once, up front,
 *   gives a cheap O(1) integer index that the per-row hot loop can use
 *   without re-doing string comparison work.
 *
 * Why tolerate `#Table1` and `--` comment lines?
 *   SkyServer prepends a `#Table1` banner to the CSV; some manually-saved
 *   exports also keep a leading SQL comment (`-- query: SELECT ...`). The
 *   `nonCommentLines` helper strips both so we don't have to special-case
 *   them inside the row loop.
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

/**
 * Result of parsing an SDSS CSV: the validated records plus a count of
 * rows that were dropped on the floor. We surface `skipped` separately
 * so the CLI can print it as a sanity check — a sudden jump in skipped
 * rows usually signals the SQL query has changed in some unexpected way
 * (e.g. the user accidentally selected stars, which all have z = 0).
 */
export type SdssCsvResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Parse an SDSS SkyServer CSV blob into canonical records.
 *
 * A row is *skipped* (counted in `result.skipped`) when:
 *   - `z <= 0` — a star, a QSO at z = 0, or a catalogue error. Galaxies
 *     have strictly positive cosmological redshifts; a non-positive z
 *     means the row isn't usefully placeable in 3D space.
 *   - Any of the five magnitude columns is empty or fails to parse as a
 *     finite number. Without all five bands we can't compute K-corrected
 *     rest-frame colours in the shader.
 *   - `objID` is empty, non-numeric, or zero. SDSS uses 0 as a sentinel
 *     for "no object", so a 0 ID is by definition not a real galaxy.
 *
 * Throws (rather than returning) when the CSV is structurally broken —
 * fewer than 2 lines after stripping comments, or a required column
 * missing from the header — because those are programmer errors that no
 * amount of skipping individual rows can recover from.
 */
export function parseSdssCsv(rawText: string): SdssCsvResult {
  // Strip blank/comment lines first; this collapses SkyServer's `#Table1`
  // banner and any stray blank trailing lines so the rest of the parser
  // can assume `lines[0]` is the real header and `lines[1..]` is data.
  const lines = nonCommentLines(rawText);

  if (lines.length < 2) {
    throw new Error('SDSS CSV has no data rows (need at least a header + one data row)');
  }

  // ─── Header parsing ─────────────────────────────────────────────────
  //
  // Trim whitespace from each column name and lowercase it so the
  // lookup below tolerates `Ra` vs `ra`, ` modelMag_u` vs `modelMag_u`,
  // etc. SkyServer is usually consistent but other downloaders are not.
  const headerLine = lines[0]!;
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  /**
   * Find the 0-based column index for a required column name. We throw
   * (not return -1) so that downstream code can use the returned index
   * unconditionally without re-checking — a guarantee that each column
   * exists turns nine "did the lookup succeed?" checks into one.
   */
  const requireColumn = (name: string): number => {
    const idx = headers.indexOf(name.toLowerCase());
    if (idx === -1) {
      throw new Error(`SDSS CSV missing required column "${name}". Found: ${headers.join(', ')}`);
    }
    return idx;
  };

  const COL_OBJID = requireColumn('objID');
  const COL_RA = requireColumn('ra');
  const COL_DEC = requireColumn('dec');
  const COL_Z = requireColumn('z');
  const COL_MAG_U = requireColumn('modelMag_u');
  const COL_MAG_G = requireColumn('modelMag_g');
  const COL_MAG_R = requireColumn('modelMag_r');
  const COL_MAG_I = requireColumn('modelMag_i');
  const COL_MAG_Z = requireColumn('modelMag_z');

  // ─── Row parsing ────────────────────────────────────────────────────

  const records: ParsedRecord[] = [];
  let skipped = 0;

  // `lines[0]` is the header; data starts at index 1.
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const cells = line.split(',').map((c) => c.trim());

    // Pull out the numeric fields. With `noUncheckedIndexedAccess` each
    // `cells[idx]` is `string | undefined`; we coerce undefined → '' so
    // that `parseFloat('')` → NaN, which the validity check below
    // detects uniformly with any other parse failure.
    const ra = parseFloat(cells[COL_RA] ?? '');
    const dec = parseFloat(cells[COL_DEC] ?? '');
    const z = parseFloat(cells[COL_Z] ?? '');
    const magU = parseFloat(cells[COL_MAG_U] ?? '');
    const magG = parseFloat(cells[COL_MAG_G] ?? '');
    const magR = parseFloat(cells[COL_MAG_R] ?? '');
    const magI = parseFloat(cells[COL_MAG_I] ?? '');
    const magZ = parseFloat(cells[COL_MAG_Z] ?? '');

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

    // Parse objID as a 64-bit unsigned bigint. `BigInt(s)` throws for
    // empty strings, non-numeric strings, and floats (e.g. "1.5"), so
    // we wrap the whole thing in try/catch and treat any failure as a
    // skipped row. A literal `0n` is also rejected — SDSS uses 0 as a
    // sentinel for "no object".
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

    records.push({
      source: Source.SDSS,
      objID,
      ra,
      dec,
      z,
      magU,
      magG,
      magR,
      magI,
      magZ,
      // TODO Task 4 (galaxy-orientation-disks): blend SDSS PhotoObj's
      // expAB_r / deVAB_r and expPhi_r / deVPhi_r columns into a single
      // axisRatio + positionAngleDeg (weighted by fracDeV_r). The current
      // SkyServer query in data/raw/ doesn't yet select those columns, so
      // we emit `null` and the build pipeline routes every SDSS row through
      // fallbackOrientation in the meantime.
      axisRatio: null,
      positionAngleDeg: null,
    });
  }

  return { records, skipped };
}
