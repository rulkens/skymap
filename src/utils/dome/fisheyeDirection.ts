/**
 * fisheyeDirection — equidistant-fisheye NDC → dome-space unit direction.
 * `r = 0` sits at the zenith; the bottom edge (0, −1) is the front horizon
 * and image-right is dome right, matching the plan's "Pixel → NDC" table.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function fisheyeDirection(ndcX: number, ndcY: number): Vec3 | null {
  const r = Math.hypot(ndcX, ndcY);
  if (r > 1) return null;
  if (r === 0) return [0, 1, 0];
  const theta = (r * Math.PI) / 2;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  return [sinT * (ndcX / r), cosT, -sinT * (ndcY / r)];
}
