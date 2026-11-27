/** The inverse of `matrixToQuaternion`: a unit quaternion (x, y, z, w) as a tight column-major Mat3. */
import { mat3 } from 'wgpu-matrix';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec4 } from '../../@types/math/Vec4';

export function quaternionToMatrix(q: Readonly<Vec4>): Mat3 {
  // wgpu-matrix pads each column to a vec4: indices 3, 7 and 11 are padding.
  const m = mat3.fromQuat(q);
  return [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!];
}
