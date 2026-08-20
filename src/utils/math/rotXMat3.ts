/**
 * rotXMat3 — exact (sin/cos-built, orthonormal to float64 precision) rotation
 * about the local/world X axis. Column-major, matching the project's `Mat3`
 * convention (cell row r, column c at `m[c*3 + r]`).
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function rotXMat3(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
