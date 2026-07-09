/**
 * makeRaDecZBoxFilter — build a bounded RA × Dec × redshift box membership
 * predicate: a row is inside when its RA lies in `[raMinDeg, raMaxDeg]`, its Dec
 * in `[decMinDeg, decMaxDeg]`, AND its redshift in `[zMin, zMax]`.
 *
 * Where `makeConeFilter` and `makeDecBandFilter` drill INFINITELY along the line
 * of sight — every row inside the sky window is kept regardless of distance —
 * this filter adds the third, radial dimension, so the kept region is a closed
 * volume floating in space rather than an unbounded beam. That extra `z` bound
 * is exactly what lets a patch isolate a single structure at a known distance
 * (the Sloan Great Wall's ~0.055–0.095 redshift shell) instead of the whole
 * pencil of galaxies behind it.
 *
 * Like `makeDecBandFilter`, this needs no trig: the box is a pure interval test
 * in the catalog's own equatorial + redshift coordinates, six comparisons per
 * row. The alternative — expressing the wall as a rotated/curved comoving slab
 * in Cartesian space — would need a per-row deprojection to xyz plus plane
 * math; a coordinate-space box is far simpler and, because the redshift window
 * is deliberately generous, gives up nothing the wall's science needs.
 *
 * RA wraparound is deliberately NOT handled, same stance as `makeDecBandFilter`:
 * the spans this filter is used for (e.g. RA 137°–214°) don't cross the 0°/360°
 * seam, so a plain `raMin <= ra <= raMax` is correct. A future box whose RA span
 * wraps past 0° must extend this — until then, leaving it out keeps the
 * predicate a plain interval test rather than carrying seam-handling logic no
 * caller exercises.
 */

export function makeRaDecZBoxFilter(
  raMinDeg: number,
  raMaxDeg: number,
  decMinDeg: number,
  decMaxDeg: number,
  zMin: number,
  zMax: number,
): (raDeg: number, decDeg: number, z: number) => boolean {
  return (raDeg: number, decDeg: number, z: number): boolean =>
    raDeg >= raMinDeg &&
    raDeg <= raMaxDeg &&
    decDeg >= decMinDeg &&
    decDeg <= decMaxDeg &&
    z >= zMin &&
    z <= zMax;
}
