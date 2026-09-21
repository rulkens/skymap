/**
 * apparentDiameterPx — small-angle on-screen size, in pixels, of an object
 * `diameterWorld` across at `distWorld` away, given the view's pixels-per-
 * radian along y (`FrameView.drawPxPerRad`). Same shape as `apparentSizePx`
 * (the per-galaxy helper the engine's thumbnail gating uses), but in a single
 * world unit — caller keeps diameter and distance in the same unit (Mpc in
 * this app) instead of the kpc/Mpc split the catalog helper bakes in.
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
  pxPerRad: number,
): number {
  return (diameterWorld / Math.max(distWorld, 1e-12)) * pxPerRad;
}
