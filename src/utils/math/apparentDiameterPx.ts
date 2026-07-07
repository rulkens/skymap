/**
 * apparentDiameterPx — small-angle on-screen size, in pixels, of an object
 * `diameterWorld` across at `distWorld` away, under a perspective camera
 * with vertical fov `fovYRad` rendering into a viewport `viewportHeightPx`
 * tall. Same shape as `apparentSizePx` (the per-galaxy helper the engine's
 * thumbnail gating uses), but in a single world unit — caller keeps
 * diameter and distance in the same unit (Mpc in this app) instead of the
 * kpc/Mpc split the catalog helper bakes in.
 *
 * The vertical fov is the right axis: `mat4.perspectiveZO(fovY, …)` scales
 * y by `1 / tan(fovY/2)`, so pixels-per-radian along y is
 * `viewportHeightPx / (2·tan(fovY/2))` — NOT `viewport / fovY`, which is
 * off by ~5% at 60°.
 *
 * Distance is clamped to a tiny positive floor rather than returning 0 for
 * `distWorld <= 0` (the `apparentSizePx` choice): the callers here use the
 * result as a fade input, and a camera AT (or numerically past) the object
 * means the object fills the view — an enormous apparent size, i.e. full
 * strength — not an invisible one.
 */
export function apparentDiameterPx(
  diameterWorld: number,
  distWorld: number,
  fovYRad: number,
  viewportHeightPx: number,
): number {
  const pxPerRad = viewportHeightPx / (2 * Math.tan(fovYRad / 2));
  return (diameterWorld / Math.max(distWorld, 1e-12)) * pxPerRad;
}
