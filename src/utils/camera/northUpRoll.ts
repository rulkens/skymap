/**
 * northUpRoll — the camera roll that puts a body's geographic north at the
 * top of the frame while looking along `forward` (straight down, for the
 * clips that use it). Undefined when `forward` runs along the frame pole;
 * callers look down on places well clear of it.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { frameUp } from './frameUp';
import { rollFromScreenUp } from './rollFromScreenUp';

export function northUpRoll(
  forward: Readonly<Vec3>,
  bodyOrientation: Readonly<Mat3>,
  basis: Readonly<Mat3>,
): number {
  const pole = rotateVec3ByTightMat3(BODY_LOCAL_FRAME.pole, bodyOrientation as Mat3);
  return rollFromScreenUp(forward as Vec3, pole, frameUp(basis as Mat3));
}
