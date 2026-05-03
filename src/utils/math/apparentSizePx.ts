/**
 * Compute on-screen pixel size of an object with the given physical diameter
 * at the given distance, under a perspective camera with `fovYRad` vertical
 * field of view rendering into a viewport `viewportHeightPx` tall.
 *
 * Why "vertical" specifically? `mat4.perspectiveZO(fovY, …)` uses the vertical
 * field-of-view, and the projection scales the **y axis** by `1 / tan(fovY/2)`.
 * So the angular-size-to-pixel conversion is dictated by the y axis. If you
 * accidentally pass the horizontal fov, the result is wrong by aspect-ratio.
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
  viewportHeightPx: number;
  fovYRad: number;
}): number {
  const { diameterKpc, distanceMpc, viewportHeightPx, fovYRad } = input;
  if (distanceMpc <= 0 || diameterKpc <= 0) return 0;
  // Small-angle: tan(θ) ≈ θ for θ ≪ 1 rad. Galaxy angular sizes are at most
  // a few arcminutes (~0.001 rad), so the approximation error is < 1 ppm.
  const angularRad = diameterKpc / (distanceMpc * 1000);
  // Pixels per radian along the y axis under a standard perspective
  // projection: viewport / (2·tan(fovY/2)).  This is NOT
  // viewport / fovY — that linear approximation is off by ~5% at fovY=60°,
  // which would skew the threshold gating in the engine.
  const pxPerRad = viewportHeightPx / (2 * Math.tan(fovYRad / 2));
  return angularRad * pxPerRad;
}
