/**
 * Compute on-screen pixel size of an object with the given physical diameter
 * at the given distance, given the view's pixels-per-radian along the y axis
 * (`FrameView.drawPxPerRad` — tangent-exact, holds for an asymmetric frustum;
 * `viewportHeightPx / (2·tan(fovY/2))` is only ulp-accurate for a symmetric one).
 *
 * Why the kpc/Mpc split? Distances in our point cloud are in Mpc (cosmology
 * units), but galaxies have diameters in kpc (galactic units). 1 Mpc = 1000 kpc.
 *
 * Returns 0 for non-positive distance — defensively handles a galaxy at the
 * camera target (distance=0 would otherwise divide by zero).  Returns 0
 * for non-positive diameter too as a sanity guard, even though our callers
 * never pass one.
 */
export function apparentSizePx(input: {
  diameterKpc: number;
  distanceMpc: number;
  pxPerRad: number;
}): number {
  const { diameterKpc, distanceMpc, pxPerRad } = input;
  if (distanceMpc <= 0 || diameterKpc <= 0) return 0;
  // Small-angle: tan(θ) ≈ θ for θ ≪ 1 rad. Galaxy angular sizes are at most
  // a few arcminutes (~0.001 rad), so the approximation error is < 1 ppm.
  const angularRad = diameterKpc / (distanceMpc * 1000);
  return angularRad * pxPerRad;
}
