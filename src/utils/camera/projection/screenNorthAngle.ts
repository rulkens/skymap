/**
 * screenNorthAngle — the screen angle (radians, counter-clockwise from up) of
 * celestial north at a world direction, read off a small projected step toward
 * the pole; 0 when the step falls behind the eye.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Size } from '../../../@types/rendering/Size';
import type { Vec3 } from '../../../@types/math/Vec3';
import { projectDirToPx } from './projectDirToPx';

export function screenNorthAngle(
  dir: Readonly<Vec3>,
  at: readonly [number, number],
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
): number {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  // A small step toward the pole along the meridian, projected.
  const step = 0.01;
  const ahead = projectDirToPx(
    [d[0] - d[0] * d[2] * step, d[1] - d[1] * d[2] * step, d[2] + (1 - d[2] * d[2]) * step],
    basis,
    frustum,
    size,
  );
  if (ahead === null) return 0;
  return Math.atan2(-(ahead.x - at[0]), -(ahead.y - at[1]));
}
