/**
 * Hipparcos-2 fixed-width parser — VizieR catalog I/311
 * (van Leeuwen 2007, "Hipparcos, the New Reduction of the Raw Data").
 *
 * Format: 276-byte fixed-width ASCII (`hip2.dat`), one bright-star record
 * per line. The full record carries proper motions, per-parameter formal
 * errors, goodness-of-fit statistics, and solution-type flags; for the
 * star-bin we need only the astrometry needed to place a star in space and
 * colour it. Byte ranges below are 1-based inclusive (as published in the
 * ReadMe) and we slice them with the shared `slot()` helper, which converts
 * to JS's 0-based half-open indexing:
 *
 *   bytes   1–  6   HIP     I6      Hipparcos identifier
 *   bytes  16– 28   RArad   F13.10  right ascension, RADIANS, ICRS Ep=1991.25
 *   bytes  30– 42   DErad   F13.10  declination, RADIANS
 *   bytes  44– 50   Plx     F7.2    trigonometric parallax, MILLIARCSECONDS
 *   bytes 130–136   Hpmag   F7.4    Hipparcos broad-band magnitude
 *   bytes 153–158   B−V     F6.3    Johnson B−V colour, mag
 *   bytes 166–171   V−I     F6.3    Cousins V−I colour, mag (parsed; not currently consumed)
 *
 * V−I is listed above for byte-layout completeness; the current output
 * contract carries only B−V (consumed downstream by `bvToBpRp` to reuse the
 * catalog colour LUT), so V−I is not extracted here yet.
 *
 * ---
 * ### Conversions at the parser boundary
 *
 * The .dat stores RA/Dec in radians and parallax in milliarcseconds, but the
 * rest of the pipeline speaks the same units as every other catalog parser:
 * degrees for angles, parsecs for distance. We convert here, at the edge, so
 * that downstream code can feed `raDecDistToCartesian(raDeg, decDeg, distPc)`
 * with no per-source special-casing:
 *
 *   raDeg  = RArad · 180/π
 *   decDeg = DErad · 180/π
 *   distPc = 1000 / Plx        (Plx in mas; 1000 mas = 1 arcsec = 1/parsec)
 *
 * ---
 * ### Skip rule
 *
 * A star is dropped (and counted in `skipped`) when it has no physical
 * position: either its parallax is non-positive (Plx ≤ 0 — a negative or
 * zero measured parallax is a noise artefact for a nearby-star reduction and
 * yields an infinite or negative distance), or one of the REQUIRED numeric
 * fields (HIP, RArad, DErad, Plx, Hpmag) fails to parse. Both outcomes mean
 * "no usable row", so both land in the single `skipped` tally rather than
 * throwing — a 118k-row survey file should never abort a build over one bad
 * line. A blank/unparseable B−V is NOT a skip: it becomes `bv = NaN` and the
 * row is kept. Only stars near Hp ≈ 4 and brighter reach the build, and every
 * such star has a measured B−V, so a leaked NaN would be surfaced loudly at
 * the octree stage rather than silently poisoning the colour LUT.
 */

import { nonCommentLines, slot } from './common';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';

/** Radians → degrees. Named so the conversion at the boundary is greppable. */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * One accepted Hipparcos-2 star. Tool-local (not a `src/@types` entry): the
 * shape exists only to hand rows from this parser to the star-bin build step,
 * so co-locating it with the parser keeps the contract in one place.
 */
export type Hip2Row = {
  /** Hipparcos catalogue number (HIP). */
  hip: number;
  /** Right ascension in decimal degrees (ICRS, Ep=1991.25), [0, 360). */
  raDeg: number;
  /** Declination in decimal degrees, [−90, 90]. */
  decDeg: number;
  /** Distance in parsecs, derived from the trigonometric parallax. */
  distPc: number;
  /** Hipparcos broad-band magnitude Hp. */
  hpMag: number;
  /** Johnson B−V colour in mag; `NaN` when the source column is blank. */
  bv: number;
};

/**
 * Result of parsing a `hip2.dat` blob: the accepted rows plus the count of
 * rows dropped by the skip rule. Surfacing `skipped` lets the build CLI print
 * it as a sanity check — a handful is expected (a few negative parallaxes); a
 * large number means the wrong file or a truncated download.
 */
export type Hip2Result = {
  rows: Hip2Row[];
  skipped: number;
};

/**
 * Parse a raw `hip2.dat` blob into `Hip2Row[]`. IO-free (takes the file
 * content, not a path) so unit tests can pass fixture strings directly. See
 * the module docstring for the byte layout, the unit conversions, and the
 * skip rule.
 */
export function parseHipparcos2(rawText: string): Hip2Result {
  const rows: Hip2Row[] = [];
  let skipped = 0;

  for (const line of nonCommentLines(rawText)) {
    // Byte ranges are 1-based inclusive per the ReadMe; `slot` trims each cell
    // (the numeric columns are space-padded on the left in the source file).
    const hip = parseInt(slot(line, 1, 6), 10);
    const raRad = parseFloat(slot(line, 16, 28));
    const deRad = parseFloat(slot(line, 30, 42));
    const plxMas = parseFloat(slot(line, 44, 50));
    const hpMag = parseFloat(slot(line, 130, 136));

    // B−V may be blank for a small number of stars; `slot` returns '' for a
    // blank column, and we keep the row with `bv = NaN` rather than dropping
    // it (see the skip-rule block in the module docstring).
    const bvStr = slot(line, 153, 158);
    const bv = bvStr === '' ? NaN : parseFloat(bvStr);

    // Hpmag goes through the shared plausibility predicate rather than a
    // bare finiteness check: VizieR-distributed reductions substitute a
    // numeric sentinel when a column is unmeasured, and a finite -9999 would
    // otherwise become the brightest star in the sky.
    if (
      !Number.isFinite(hip) ||
      !Number.isFinite(raRad) ||
      !Number.isFinite(deRad) ||
      !Number.isFinite(plxMas) ||
      !isPlausibleMagnitude(hpMag)
    ) {
      // A required numeric field failed to parse — no usable row.
      skipped++;
      continue;
    }

    if (plxMas <= 0) {
      // Non-positive parallax has no physical distance; drop and count.
      skipped++;
      continue;
    }

    rows.push({
      hip,
      raDeg: raRad * RAD_TO_DEG,
      decDeg: deRad * RAD_TO_DEG,
      distPc: 1000 / plxMas,
      hpMag,
      bv,
    });
  }

  return { rows, skipped };
}
