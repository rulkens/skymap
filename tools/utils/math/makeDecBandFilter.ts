/**
 * makeDecBandFilter — build a declination-band membership predicate: a row is
 * inside when its Dec sits within `halfThicknessDeg` of `decCenterDeg` AND its
 * RA lies in `[raMinDeg, raMaxDeg]`.
 *
 * Unlike `makeConeFilter`, this needs no trig at all — a constant-Dec band and
 * a fixed RA span are pure interval tests in the catalog's own equatorial
 * coordinates, so the predicate is four comparisons per row. (Geometrically the
 * band isn't planar — a constant-Dec locus is a small circle around the polar
 * axis, bowing gently out of any tangent plane — but membership is still just
 * "is Dec in range and RA in range", which coordinates answer directly. A truly
 * flat great-circle slab is the case that WOULD need a plane-normal dot product,
 * and would ship as a separate `makeGreatCircleBandFilter` factory shaped like
 * `makeConeFilter`.)
 *
 * RA wraparound is deliberately NOT handled: the spans this filter is used for
 * (e.g. RA 205°–270°) don't cross the 0°/360° seam, so a simple
 * `raMin <= ra <= raMax` is correct. A future patch whose RA span wraps past 0°
 * must extend this — until then, leaving it out keeps the predicate a plain
 * interval test rather than carrying seam-handling logic no caller exercises.
 */

export function makeDecBandFilter(
  decCenterDeg: number,
  halfThicknessDeg: number,
  raMinDeg: number,
  raMaxDeg: number,
): (raDeg: number, decDeg: number) => boolean {
  // Precompute the Dec band edges once so the predicate is four comparisons.
  const decMin = decCenterDeg - halfThicknessDeg;
  const decMax = decCenterDeg + halfThicknessDeg;

  return (raDeg: number, decDeg: number): boolean =>
    decDeg >= decMin && decDeg <= decMax && raDeg >= raMinDeg && raDeg <= raMaxDeg;
}
