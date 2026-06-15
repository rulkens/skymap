/**
 * mat3FromColumns — build a flat column-major `Mat3` from three column
 * vectors.  Because the storage is column-major, each column lands as a
 * contiguous 3-element span — no stride juggling.
 *
 * Cell at row r, column c is `m[c*3 + r]`.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function mat3FromColumns(c0: Vec3, c1: Vec3, c2: Vec3): Mat3 {
  return [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]];
}
