/**
 * rotYMat3 — exact (sin/cos-built, orthonormal to float64 precision) rotation
 * about the local/world Y axis. Column-major, matching the project's `Mat3`
 * convention (cell row r, column c at `m[c*3 + r]`).
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function rotYMat3(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
