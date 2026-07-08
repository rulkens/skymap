/**
 * Shared types for catalog parsers.
 *
 * All survey parsers (SDSS, 2MRS, 2MPZ, 6dFGS, …) converge on `ParsedRecord`
 * as their output shape, decoupling each parser from the merge step:
 *
 *   raw bytes  →  parser  →  ParsedRecord[]  →  merge/dedup  →  .bin
 *
 * This separation enables cross-survey deduplication (e.g. "is this 2MPZ row
 * also in SDSS via SDSS_OBJID?") and source-priority ordering, both of which
 * require the full record arrays from all parsers before any comparison.
 *
 * ### NaN / 0n sentinels instead of `undefined` or `null`
 *
 * Downstream consumers are numeric (merger comparisons, typed-array encoding,
 * GPU f32 uploads). NaN is the natural missing-value sentinel for IEEE-754:
 * it propagates through arithmetic, survives Float32Array round-trips, and
 * `NaN !== NaN` makes accidental equality bugs loud. For `objID`, `0n` mirrors
 * SDSS's own "no object" sentinel — missing objID means "no SDSS cross-ID",
 * not a distinct absent state requiring extra narrowing.
 */

import type { SourceType } from '../../src/@types/data/SourceType';

export type ParsedRecord = {
  source: SourceType;
  /**
   * Numeric SDSS objID when known (SDSS rows always have one; some 2MPZ
   * rows include an `SDSS_OBJID` cross-ID column). 0n means "no SDSS
   * cross-ID for this record" — used by the merger's dedup pass to skip
   * records that have no anchor against the SDSS catalog.
   */
  objID: bigint;
  ra: number; // degrees, J2000
  dec: number; // degrees, J2000
  z: number; // redshift (spectroscopic or photometric depending on survey)
  /**
   * Catalogued spectroscopic redshift, preserved verbatim from the source row.
   * Diverges from `z` when the local-volume override fires: `z` drives position,
   * `spectroscopicZ` is what the InfoCard always shows. NaN is the legal
   * "no published spec-z" sentinel for Famous-galaxy rows with a measured
   * distance but no published redshift.
   */
  spectroscopicZ: number;
  /**
   * Apparent magnitudes in the SDSS *ugriz* system. NaN when the survey
   * doesn't cover that band (e.g. all five are NaN for 2MRS rows).
   */
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
  /**
   * Minor/major axis ratio b/a ∈ (0, 1]. `null` means no real measurement —
   * the pipeline applies a deterministic fallback before encoding. `null`
   * rather than NaN because orientation is a binary "measured vs. fallback"
   * decision; TypeScript narrowing forces every caller to handle it explicitly.
   */
  axisRatio: number | null;
  /**
   * Position angle in degrees east of north, [0, 180). `null` = no measurement
   * (same semantics as `axisRatio`). Flat field rather than a paired struct
   * because some parsers source PA and axis ratio from different upstream tables
   * and need to fill them independently.
   */
  positionAngleDeg: number | null;
  /**
   * Physical diameter in kiloparsecs, survey-specific derivation:
   *   - 2MRS  → 2 · 10^Riso · arcsecToKpc(1, distance_Mpc)
   *   - GLADE → Tully(1988) from absolute B mag
   *   - SDSS  → 3 · petroR50_r · arcsecToKpc(1, distance_Mpc)
   *
   * `null` = no measurement; pipeline applies DEFAULT_GALAXY_DIAMETER_KPC = 30.
   * Same `null`-over-NaN rationale as `axisRatio`.
   */
  diameterKpc: number | null;
  /**
   * Per-source classification byte (see `src/data/galaxyCatalog/sourceClass.ts`).
   * Defaults to `0` (unknown); Milliquas populates it with the AGN letter
   * (Q/A/B/K/N/S → enum 1..6), DESI Deep with the LSS tracer
   * (BGS/LRG/ELG/QSO → enum 1..4). Flat byte mirrors the .bin format (v5,
   * one byte per record); the pipeline copies it opaque, so each parser
   * handles its own translation.
   */
  classByte: number;

  /**
   * Milliquas-only parent-survey enum byte (see `milliquasParentSurveyPrefix`
   * in `src/data/sourceClass.ts`). Other parsers leave it `0`. Milliquas
   * matches the Name column prefix (`SDSS`, `2MASX`, `GAIA`, …) so the runtime
   * can reconstruct `"<PARENT> J<RA><Dec>"` at hover time. Same
   * flat-byte rationale as `classByte`.
   */
  parentSurveyByte: number;
  /**
   * 2MASS XSC designation, e.g. `00473313-2517196` (no `2MASX J` prefix).
   * Populated by the 2MRS parser; used in `buildAllBins` to join against a
   * `2MASX → PGC` map so 2MRS rows without a native PGC can still reach CF4
   * distances. Not part of the .bin format — consumed once during the 2MRS
   * post-processing pass, then discarded.
   */
  massId?: string;
};

/**
 * Extract a fixed-width field using 1-based inclusive byte offsets (as
 * published in CDS VizieR ReadMes), then trim whitespace. Centralising the
 * 1-based→0-based conversion lets every parser write the ReadMe's literal byte
 * numbers directly. Returns `''` for slices past the line end.
 */
export function slot(line: string, start: number, end: number): string {
  return line.slice(start - 1, end).trim();
}

/**
 * Strip blank lines, `#`-prefixed lines (SDSS SkyServer banners / VizieR
 * provenance comments), and `--`-prefixed lines (SQL comments) from a raw
 * text blob. Returns the surviving rows in order; element 0 is the header.
 */
export function nonCommentLines(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t !== '' && !t.startsWith('#') && !t.startsWith('--');
    });
}
