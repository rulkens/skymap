/**
 * directionToFisheye — dome-space unit direction → equidistant-fisheye NDC,
 * the inverse of `fisheyeDirection` (zenith at the centre, front horizon at (0, −1)).
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function directionToFisheye(dir: Readonly<Vec3>): [number, number] {
  const sinT = Math.hypot(dir[0], dir[2]);
  if (sinT === 0) return [0, 0];
  const r = Math.acos(Math.max(-1, Math.min(1, dir[1]))) / (Math.PI / 2);
  return [(r * dir[0]) / sinT, (-r * dir[2]) / sinT];
}
