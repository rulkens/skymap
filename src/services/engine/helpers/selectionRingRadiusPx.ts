/**
 * selectionRingRadiusPx — on-screen radius (pixels) of the selection halo
 * for a target of physical radius `radiusMpc` viewed from `camDistMpc`.
 *
 * The ring is sized larger than the object it surrounds (`RING_SIZE_SCALE`)
 * to leave visual breathing room.  This is the halo size only — the
 * Milky-Way pick target sizes itself to the disc's *visible* extent
 * instead (the bare apparent radius, no ring scale; computed in the pick
 * vertex shader — see `milkyWay/pick/vertex.wesl`), so the clickable area
 * lands on the glow the user sees rather than the larger ring.
 *
 * ## The math (mirrors points/vertex.wesl's apparent-size billboard)
 *
 *   apparentPxRadius = (radiusMpc / max(camDistMpc, 0.001)) * pxPerRad
 *   sizePx           = max(pointSizePx, apparentPxRadius * 0.5)
 *   ringRadiusPx     = sizePx * RING_SIZE_SCALE
 *
 * The `* 0.5` cancels half of the 4× padding the points pipeline bakes
 * into its billboard footprint (to share size with the textured
 * thumbnail) — without it, the halo balloons on zoomed-in galaxies.  The
 * `pointSizePx` floor is the same far-field 'still detectable as a glowing
 * dot' minimum the points shader applies (points/vertex.wesl,
 * `max(u.pointSizePx, apparentPxRadius)`); it keeps a small/distant target
 * ringed — and, for the pick path, keeps it hittable.
 *
 * Callers pass `radiusMpc` already in the convention the formula expects:
 * a galaxy passes `diameterKpc * 2 / 1000` (the padded footprint the
 * shader bakes); the Milky Way passes `MILKY_WAY_DISC_RADIUS_KPC / 1000`.
 */

// Multiplier from the target's base on-screen size to the halo radius.
// Tuned for visual breathing room around the selected point.
const RING_SIZE_SCALE = 6;

export function selectionRingRadiusPx(
  radiusMpc: number,
  camDistMpc: number,
  pxPerRad: number,
  pointSizePx: number,
): number {
  const safeDist = Math.max(camDistMpc, 0.001);
  const apparentPxRadius = (radiusMpc / safeDist) * pxPerRad;
  const sizePx = Math.max(pointSizePx, apparentPxRadius * 0.5);
  return sizePx * RING_SIZE_SCALE;
}
