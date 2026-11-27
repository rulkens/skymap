/**
 * meshShadowLightFromLocal — a shadow slot's light matrix re-based from the body's MESH frame
 * onto the offset from its centre in HOST axes (the mesh fragment's `localPos`):
 * `lightFromMesh · rotMᵀ`, `rotM` being this frame's mesh-to-host rotation. f64; narrow at the write.
 */

import { mat4d } from 'wgpu-matrix';
import type { Mat3 } from '../../@types/math/Mat3';
import { mat4dFromMat3 } from '../math/mat4dFromMat3';

export function meshShadowLightFromLocal(
  lightFromMesh: Float64Array,
  rotM: Readonly<Mat3>,
): Float64Array {
  const m = rotM;
  const meshFromLocal = mat4dFromMat3([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
  return mat4d.multiply(lightFromMesh, meshFromLocal) as Float64Array;
}
