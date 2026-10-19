/**
 * selectionRingRadiusPx — on-screen radius (pixels) of the selection halo for
 * a target of physical radius `radiusMpc` viewed from `camDistMpc`. Halo only:
 * the Milky-Way pick target sizes itself in `milkyWay/pick/vertex.wesl`.
 *
 * Mirrors points/vertexBody.wesl's apparent-size billboard:
 *
 *   apparentPxRadius = (radiusMpc / max(camDistMpc, 0.001)) * pxPerRad
 *   sizePx           = max(pointSizePx, apparentPxRadius * 0.5)
 *   ringRadiusPx     = sizePx * RING_SIZE_SCALE
 *
 * The `* 0.5` cancels half of the 4x padding baked into the points
 * billboard footprint; without it the halo balloons on zoomed-in galaxies.
 *
 * `radiusMpc` convention: a galaxy passes `diameterKpc * 2 / 1000` (the padded
 * footprint); the Milky Way passes `MILKY_WAY_DISC_RADIUS_KPC / 1000`.
 */

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
