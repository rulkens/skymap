/**
 * cameraBasisWorld — a camera's world-space right | up | forward as columns:
 * THE basis every world-frame consumer (`bodyRelativePose`, a `ViewSpec`'s
 * rotation) is relative to. One seam, so a body row's screen orientation can
 * never drift from NEAR0's.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { imagePlaneBasis } from './imagePlaneBasis';
import { frameUp } from './frameUp';
import { mat3FromColumns } from '../math/mat3FromColumns';

/** `upBasis` absent ⇒ the identity frame, screen-up world +Y (`frameUp`). */
export function cameraBasisWorld(
  forward: Vec3,
  rollRad: number,
  upBasis: Readonly<Mat3> | undefined,
): Mat3 {
  const { right, up } = imagePlaneBasis(forward, rollRad, frameUp(upBasis));
  return mat3FromColumns(right, up, forward);
}
