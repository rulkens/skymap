/**
 * Transpose of a column-major Mat3.  For an orthonormal rotation this is
 * its inverse.  Indexing reminder: m[c*3 + r] becomes m'[r*3 + c].
 *
 * Column-major is the skymap-wide convention (gl-matrix, WebGPU, GLSL);
 * we mirror it offline so SG↔EQ transforms in tools/ match the runtime.
 */
import type { Mat3 } from '../../../src/@types/math/Mat3';

export function transpose3(m: Mat3): Mat3 {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}
