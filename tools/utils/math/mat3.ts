/**
 * 3×3 matrix ops in the column-major convention used everywhere in
 * skymap (gl-matrix, WebGPU, GLSL).
 *
 * Index map: cell at row r, column c is at `m[c*3 + r]`.  This is the
 * convention `Mat3` (src/@types/math/Mat3.d.ts) documents and that
 * gl-matrix follows; we mirror it offline so SG↔EQ transforms in
 * tools/ behave identically to the runtime.
 */
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * Apply a column-major Mat3 to a Vec3.
 *   result[r] = Σ_c m[c*3 + r] · v[c]
 */
export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}

/**
 * Transpose of a column-major Mat3.  For an orthonormal rotation this
 * is its inverse.  Indexing reminder: m[c*3 + r] becomes m'[r*3 + c].
 */
export function transpose3(m: Mat3): Mat3 {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}
