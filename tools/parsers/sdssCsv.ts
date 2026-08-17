/**
 * SDSS CSV parser.
 *
 * Turns a raw SDSS SkyServer CSV blob into an array of canonical
 * `ParsedRecord`s (see `common.ts`). This module knows nothing about the
 * binary point-cloud format, file I/O, or downstream merging — it just
 * decodes one specific CSV layout. That separation is what lets
 * `buildAllBins.ts` reuse this same function alongside the other survey
 * parsers.
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

import { Source } from '../../src/data/sources';
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';
import { nonCommentLines, type ParsedRecord } from './common';

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
 * Blend SDSS exponential and de Vaucouleurs profile fits into a single
 * (axisRatio, PA) pair.
 *
 * SDSS reports two parallel fits per band — exp (disc-like) and deV
 * (bulge-like) — plus `fracDeV_r ∈ [0, 1]` saying how much of the light is
 * actually deV-shaped. Blending by fracDeV gives the PSF-realistic shape
 * the user perceives:
 *
 *   axisRatio = (1 − f) · expAB + f · deVAB
 *
 * Position-angle blending is harder because PA is *circular* on [0, 180):
 * if expPhi = 5° and deVPhi = 175° they're actually 10° apart (across the
 * 0/180 wrap), not 170°. We project to the unit circle on the doubled
 * angle (so wrap is at 360°), blend the unit vectors weighted by their
 * shapes, then atan2 back. This is the standard circular mean.
 *
 * Returns `null` if any of the five inputs is non-finite — the row's PA/AB
 * is then handed off to the deterministic fallback in the build pipeline.
 */
function blendSdssShape(
  expAB: number,
  expPhi: number,
  deVAB: number,
  deVPhi: number,
  fracDeV: number,
): { axisRatio: number; positionAngleDeg: number } | null {
  if (
    !Number.isFinite(expAB) ||
    !Number.isFinite(expPhi) ||
    !Number.isFinite(deVAB) ||
    !Number.isFinite(deVPhi) ||
    !Number.isFinite(fracDeV)
  ) {
    return null;
  }
  const f = Math.max(0, Math.min(1, fracDeV));
  const axisRatio = (1 - f) * expAB + f * deVAB;

  const e2 = (expPhi * 2 * Math.PI) / 180;
  const d2 = (deVPhi * 2 * Math.PI) / 180;
  const sx = (1 - f) * Math.cos(e2) + f * Math.cos(d2);
  const sy = (1 - f) * Math.sin(e2) + f * Math.sin(d2);
  let pa2 = Math.atan2(sy, sx);
  if (pa2 < 0) pa2 += 2 * Math.PI;
  let positionAngleDeg = (pa2 * 180) / (2 * Math.PI);
  if (positionAngleDeg >= 180) positionAngleDeg -= 180;

  return { axisRatio, positionAngleDeg };
}

/**
 * Parse an SDSS SkyServer CSV blob into canonical records.
 *
 * A row is *skipped* (counted in `result.skipped`) when:
 *   - `z <= 0` — a star, a QSO at z = 0, or a catalogue error. Galaxies
 *     have strictly positive cosmological redshifts; a non-positive z
 *     means the row isn't usefully placeable in 3D space.
 *   - Any of the five magnitude columns is empty, fails to parse as a
 *     finite number, or carries SDSS' `-9999` "no photometry" sentinel
 *     (see `isPlausibleMagnitude`). Without all five bands we can't
 *     compute K-corrected rest-frame colours in the shader.
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
  const COL_EXP_AB = requireColumn('expAB_r');
  const COL_EXP_PHI = requireColumn('expPhi_r');
  const COL_DEV_AB = requireColumn('deVAB_r');
  const COL_DEV_PHI = requireColumn('deVPhi_r');
  const COL_FRAC_DEV = requireColumn('fracDeV_r');

  /**
   * Find the 0-based column index for an optional column.  Returns -1
   * when the column is absent — the caller branches on this so the parser
   * stays compatible with older SDSS CSVs that pre-date the
   * `petroR50_r` / `petroR90_r` columns.
   */
  const optionalColumn = (name: string): number => headers.indexOf(name.toLowerCase());

  const COL_PETRO_R50 = optionalColumn('petroR50_r');
  // We look up petroR90 too so a refined visual-diameter approximation
  // can use it without re-touching the parser API.
  const _COL_PETRO_R90 = optionalColumn('petroR90_r');

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

    // Magnitudes are validated with `isPlausibleMagnitude`, not `isNaN`:
    // SDSS marks missing photometry with the in-band sentinel `-9999`,
    // which parses as a finite number and survives every NaN check the
    // pipeline applies afterwards. See the predicate's docstring for why
    // it is a range test rather than an equality check on the sentinel.
    if (
      z <= 0 ||
      isNaN(ra) ||
      isNaN(dec) ||
      isNaN(z) ||
      !isPlausibleMagnitude(magU) ||
      !isPlausibleMagnitude(magG) ||
      !isPlausibleMagnitude(magR) ||
      !isPlausibleMagnitude(magI) ||
      !isPlausibleMagnitude(magZ)
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

    // Pull the five orientation columns and blend them via the helper above.
    // We parse-then-validate inside `blendSdssShape` (rather than NaN-checking
    // here and skipping the row) because a missing orientation is not fatal —
    // the build pipeline has a deterministic fallback that fills in PA/AB from
    // the objID hash. Photometry rows with valid z + mags but missing shape
    // columns should still make it into the cloud.
    const expAB = parseFloat(cells[COL_EXP_AB] ?? '');
    const expPhi = parseFloat(cells[COL_EXP_PHI] ?? '');
    const deVAB = parseFloat(cells[COL_DEV_AB] ?? '');
    const deVPhi = parseFloat(cells[COL_DEV_PHI] ?? '');
    const fracDeV = parseFloat(cells[COL_FRAC_DEV] ?? '');

    const shape = blendSdssShape(expAB, expPhi, deVAB, deVPhi, fracDeV);

    // ── Petrosian → physical diameter ──────────────────────────────────
    //
    // SDSS petroR50_r is the Petrosian half-light RADIUS in arcseconds.
    // The visual D_25 isophote lies somewhere between petroR90_r diameter
    // and a few half-light radii out; the empirical multiplier we use is
    //
    //   diameter_kpc ≈ 3 · 2 · petroR50_r · arcsecToKpc(1, distance_Mpc)
    //
    // i.e. treat 3× the half-light DIAMETER as a stand-in for D_25.  This
    // brackets the true visual diameter within ±20 % across the SDSS
    // main-sample magnitude range — enough for a renderer footprint.  A
    // refinement could use petroR90 (closer to the visual edge) or a
    // per-galaxy sersic-index calibration; the parser exposes
    // diameterKpc as a single number to avoid leaking that decision.
    let diameterKpc: number | null = null;
    if (COL_PETRO_R50 !== -1) {
      const r50Str = cells[COL_PETRO_R50] ?? '';
      const r50 = r50Str === '' ? NaN : parseFloat(r50Str);
      if (Number.isFinite(r50) && r50 > 0) {
        const distanceMpc = redshiftToDistanceMpc(z);
        if (Number.isFinite(distanceMpc) && distanceMpc > 0) {
          const arcsecDiameter = 3 * 2 * r50;
          const kpc = arcsecToKpc(arcsecDiameter, distanceMpc);
          if (Number.isFinite(kpc) && kpc > 0) diameterKpc = kpc;
        }
      }
    }

    records.push({
      source: Source.SDSS,
      objID,
      ra,
      dec,
      z,
      spectroscopicZ: z,
      magU,
      magG,
      magR,
      magI,
      magZ,
      axisRatio: shape ? shape.axisRatio : null,
      positionAngleDeg: shape ? shape.positionAngleDeg : null,
      diameterKpc,
      // SDSS rows carry no AGN class signal and never a Milliquas
      // parent-survey prefix; both bytes stay 0 here (see
      // `src/data/sourceClass.ts` for the lookup contract).
      classByte: 0,
      parentSurveyByte: 0,
    });
  }

  return { records, skipped };
}
