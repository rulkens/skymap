/** The view's polar angle off straight-down, [0, π]. Deliberately UNSIGNED: a
 * sign needs a rotation axis, which is `tiltFloorBudgetRad`'s question (R13-1).
 * One home for `eyeFrameOf` and the tilt wall. */

import type { Vec3 } from '../../@types/math/Vec3';

export function tiltFromNadirRad(forward: Readonly<Vec3>, eyeM: Readonly<Vec3>): number {
  const mag = Math.hypot(eyeM[0], eyeM[1], eyeM[2]);
  if (mag === 0) return 0; // no nadir exists at the centre
  const vert = (forward[0] * eyeM[0] + forward[1] * eyeM[1] + forward[2] * eyeM[2]) / mag;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}
