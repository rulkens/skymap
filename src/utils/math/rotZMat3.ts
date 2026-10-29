/**
 * rotZMat3 — exact (sin/cos-built, orthonormal to float64 precision) rotation
 * about the local/world Z axis. Column-major, matching the project's `Mat3`
 * convention (cell row r, column c at `m[c*3 + r]`).
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function rotZMat3(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}
