/**
 * Thinning by brightness as the view zooms out: past `thinStartZoomAu` each class keeps only its
 * intrinsically brightest rows, down to `thinBudget` dots in all by `thinFullZoomAu`. ~900k
 * sub-pixel dots cost ~3.5 ms of raster and blend at 23 AU and read no better than 150k. The
 * survivors' tint is raised by share^−`thinGainExponent` to carry some of the dropped dots' light.
 */
export const ASTEROID_THINNING = {
  thinBudget: 150_000,
  thinStartZoomAu: 2,
  thinFullZoomAu: 12,
  thinGainExponent: 0.5,
} as const;
