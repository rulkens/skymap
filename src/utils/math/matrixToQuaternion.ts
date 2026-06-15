/**
 * matrixToQuaternion — convert a column-major 3×3 rotation matrix to a
 * unit quaternion `(x, y, z, w)` via Shepperd's method.
 *
 * Indexed for column-major storage: cell at row r, column c is
 * `m[c*3 + r]`.  The branch on the largest diagonal term avoids the
 * numerical instability of the naive trace formula when the trace is
 * small or negative.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec4 } from '../../@types/math/Vec4';

export function matrixToQuaternion(m: Mat3): Vec4 {
  // Diagonal elements: m[0], m[4], m[8] (rows 0,1,2 of columns 0,1,2).
  const m00 = m[0]!,
    m11 = m[4]!,
    m22 = m[8]!;
  // Off-diagonals: m[r][c] in row-major → m[c*3 + r] here.
  const m01 = m[3]!,
    m02 = m[6]!;
  const m10 = m[1]!,
    m12 = m[7]!;
  const m20 = m[2]!,
    m21 = m[5]!;

  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / n, y / n, z / n, w / n];
}
