/**
 * Apply a column-major Mat3 to a Vec3.
 *   result[r] = Σ_c m[c*3 + r] · v[c]
 *
 * Column-major is the convention used everywhere in skymap (gl-matrix,
 * WebGPU, GLSL): the cell at row r, column c is at `m[c*3 + r]`.  We
 * mirror it offline so SG↔EQ transforms in tools/ behave identically to
 * the runtime.
 */
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}
