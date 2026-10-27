/**
 * engageDistanceM — how far from a tiling body's centre its surface tiles can
 * engage (`zWin > baseLevel`) through a lens of `pxPerRad`: a base tile engages
 * once its footprint passes 2^(1 + lodBias) tile edges, and that footprint
 * grows with the lens's pixels per radian. Fitted to a sweep of the real
 * `cutSurfaceTiles` at the small tier (base z2, the farthest-engaging, so the
 * fit bounds every tier) over sub-camera latitudes 0–89°: 4.46 R at 60° on
 * 4096², 1075 R at 0.5° on 8192². Scale-free in radii.
 */

/** Body radii per pixel-per-radian: the far-field slope of the sweep. */
const ENGAGE_RADII_PER_PX_PER_RAD = 1.145e-3;
/** The near-field excess: a close tile's footprint grows faster than 1/d. */
const ENGAGE_OFFSET_RADII = 0.4;

export function engageDistanceM(radiusM: number, pxPerRad: number): number {
  return radiusM * (ENGAGE_OFFSET_RADII + ENGAGE_RADII_PER_PX_PER_RAD * pxPerRad);
}
