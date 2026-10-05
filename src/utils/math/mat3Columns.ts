/**
 * mat3Columns — destructure a column-major `Mat3` into its three named
 * columns. `Mat3`'s storage order is a convention, not a compiler-checked
 * invariant (see the type's own doc); every call site that indexes it by
 * hand shares the same exposure to that convention changing.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function mat3Columns(m: Readonly<Mat3>): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
} {
  return {
    right: [m[0], m[1], m[2]],
    up: [m[3], m[4], m[5]],
    forward: [m[6], m[7], m[8]],
  };
}
