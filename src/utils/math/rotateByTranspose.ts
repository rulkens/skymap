/**
 * rotateByTranspose — orientationᵀ · v.  `orientation` is orthonormal, so its
 * transpose is its inverse; column c of a transpose is row c of the
 * original, so this is the three column·v dot products with no separate
 * transpose step.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Mat3 } from '../../@types/math/Mat3';

export function rotateByTranspose(orientation: Readonly<Mat3>, v: Readonly<Vec3>): Vec3 {
  return [
    orientation[0] * v[0] + orientation[1] * v[1] + orientation[2] * v[2],
    orientation[3] * v[0] + orientation[4] * v[1] + orientation[5] * v[2],
    orientation[6] * v[0] + orientation[7] * v[1] + orientation[8] * v[2],
  ];
}
