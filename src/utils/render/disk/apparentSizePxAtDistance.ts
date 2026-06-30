/**
 * apparentSizePxAtDistance — on-screen pixel size of a galaxy from a
 * *precomputed* pixels-per-radian, the form the per-frame disk planners need.
 *
 * The sibling `apparentSizePx` takes `fovYRad` + viewport height and computes
 * `pxPerRad = height / (2·tan(fovY/2))` itself. The disk planners walk up to
 * ~300k rows per frame and must keep `Math.tan` out of the inner loop, so the
 * frame loop hoists `pxPerRad` once and passes it here. This helper is that
 * hoisted-trig variant — no transcendental per call.
 *
 * `diameterKpc / 1000` converts galactic kpc to the point cloud's Mpc; the
 * small-angle approximation (tan θ ≈ θ) is exact to < 1 ppm at galaxy angular
 * sizes, same as the sibling.
 *
 * Precondition: `camDistMpc > 0`. Callers gate on `camDistSq > 0` before the
 * square root, so a galaxy at the camera target never reaches here; the helper
 * does no defensive guard so the hot path stays a single multiply/divide.
 */
export function apparentSizePxAtDistance(
  diameterKpc: number,
  camDistMpc: number,
  pxPerRad: number,
): number {
  return (diameterKpc / 1000 / camDistMpc) * pxPerRad;
}
