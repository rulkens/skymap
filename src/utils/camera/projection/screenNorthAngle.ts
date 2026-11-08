/**
 * screenNorthAngle — the screen angle (radians, counter-clockwise from up) of
 * celestial north at a world direction, read off a small projected step toward
 * the pole; 0 when the step falls out of the projection.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { Vec3 } from '../../../@types/math/Vec3';
import { pxOfRay } from './viewProjection/pxOfRay';

export function screenNorthAngle(
  dir: Readonly<Vec3>,
  at: readonly [number, number],
  proj: ViewProjection,
): number {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  // A small step toward the pole along the meridian, projected.
  const step = 0.01;
  const ahead = pxOfRay(proj, [
    d[0] - d[0] * d[2] * step,
    d[1] - d[1] * d[2] * step,
    d[2] + (1 - d[2] * d[2]) * step,
  ]);
  if (ahead === null) return 0;
  return Math.atan2(-(ahead[0] - at[0]), -(ahead[1] - at[1]));
}
