/**
 * relErr — |got − want| / |want|, falling back to the absolute error when `want`
 * is 0.
 *
 * The camera suite works in Mpc across ~19 decades, so a body-framing distance is
 * ~1e-15 while a cosmological one is ~1e4. `toBeCloseTo(x, n)` is an ABSOLUTE
 * 0.5e-n tolerance, which at the small end passes for 0 and for a 100× error
 * alike — assert on this ratio instead whenever the expected value can be
 * sub-1.
 */
export function relErr(got: number, want: number): number {
  return want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
}
