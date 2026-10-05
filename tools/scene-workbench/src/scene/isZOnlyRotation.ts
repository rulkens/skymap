import type { Vec4 } from '../../../../src/@types/math/Vec4';

/** Whether a unit quaternion `[x, y, z, w]` rotates about Z alone — draw mode's precondition. */
export function isZOnlyRotation(rotation: Vec4): boolean {
  return Math.abs(rotation[0]) < 1e-9 && Math.abs(rotation[1]) < 1e-9;
}
