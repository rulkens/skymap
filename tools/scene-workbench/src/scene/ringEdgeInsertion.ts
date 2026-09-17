/**
 * ringEdgeInsertion — where a click on a draft ring's edge would add a corner, in screen px. Both
 * radii are pixels, not metres, so zooming in lets corners sit closer together in the world.
 */
import type { Vec2 } from '../../../../src/@types/math/Vec2';

export function ringEdgeInsertion(
  cornersPx: readonly Vec2[],
  closed: boolean,
  px: Vec2,
  edgeRadiusPx: number,
  cornerGapPx: number,
): { index: number; footPx: Vec2 } | null {
  const edgeCount = closed ? cornersPx.length : cornersPx.length - 1;
  let best: { index: number; footPx: Vec2 } | null = null;
  let bestSq = edgeRadiusPx * edgeRadiusPx;
  for (let i = 0; i < edgeCount; i++) {
    const [ax, ay] = cornersPx[i]!;
    const [bx, by] = cornersPx[(i + 1) % cornersPx.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    const lengthSq = ex * ex + ey * ey;
    if (lengthSq === 0) continue;
    const t = ((px[0] - ax) * ex + (px[1] - ay) * ey) / lengthSq;
    // The gap test on t keeps the new corner off both ends, even when the click itself is not.
    const gapT = cornerGapPx / Math.sqrt(lengthSq);
    if (t < gapT || t > 1 - gapT) continue;
    const footPx: Vec2 = [ax + t * ex, ay + t * ey];
    const distSq = (px[0] - footPx[0]) ** 2 + (px[1] - footPx[1]) ** 2;
    if (distSq <= bestSq) {
      best = { index: i + 1, footPx };
      bestSq = distSq;
    }
  }
  return best;
}
