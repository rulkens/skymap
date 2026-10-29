/** The view's polar angle off straight-down, [0, π]. Deliberately UNSIGNED: a
 * sign needs a rotation axis, which is `tiltFloorBudgetRad`'s question (R13-1).
 * One home for `eyeFrameOf` and the two arms' settles. `atan2(|f × n|, −f·n)`
 * rather than `acos(−f·n)`: acos near ±1 turns the dot's last bit into ~1e-8
 * rad, which differed between CPUs and drifted the settle golden trace. */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';

export function tiltFromNadirRad(forward: Readonly<Vec3>, eyeM: Readonly<Vec3>): number {
  if (eyeM[0] === 0 && eyeM[1] === 0 && eyeM[2] === 0) return 0; // no nadir at the centre
  const perp = cross3(forward, eyeM);
  const along = forward[0] * eyeM[0] + forward[1] * eyeM[1] + forward[2] * eyeM[2];
  return Math.atan2(Math.hypot(perp[0], perp[1], perp[2]), -along);
}
