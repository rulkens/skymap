/**
 * multiply3x3 — column-major 3×3 matrix product `result = a · b`.
 *
 * With column-major storage (cell row r, column c at `m[c*3 + r]`):
 *
 *   result[c*3 + r] = Σ_k a[k*3 + r] · b[c*3 + k]
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function multiply3x3(a: Mat3, b: Mat3): Mat3 {
  const cell = (r: 0 | 1 | 2, c: 0 | 1 | 2): number =>
    a[0 * 3 + r]! * b[c * 3 + 0]! + a[1 * 3 + r]! * b[c * 3 + 1]! + a[2 * 3 + r]! * b[c * 3 + 2]!;
  return [
    cell(0, 0),
    cell(1, 0),
    cell(2, 0),
    cell(0, 1),
    cell(1, 1),
    cell(2, 1),
    cell(0, 2),
    cell(1, 2),
    cell(2, 2),
  ];
}
