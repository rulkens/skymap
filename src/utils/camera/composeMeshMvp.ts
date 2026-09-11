/**
 * composeMeshMvp — the `body-m` slab model compose for a MESH body:
 * `slabVp · translate(posM − eyeRelBodyM) · rotate(rotM)`, f64 throughout.
 * No scale, because the mesh is authored in metres (unlike
 * `composeBodySlabMvp`'s unit sphere), and a translation that is NOT just
 * `−eyeRelBodyM`, because the body rides its host's row rather than owning one.
 * Caller narrows at the uniform write.
 */

import { mat4d } from 'wgpu-matrix';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { mat4dFromMat3 } from '../math/mat4dFromMat3';

export function composeMeshMvp(
  slabVp: Float64Array,
  posM: Readonly<Vec3>,
  eyeRelBodyM: Readonly<Vec3>,
  rotM: Readonly<Mat3>,
): Float64Array {
  const model = mat4d.multiply(
    mat4d.translation([
      posM[0] - eyeRelBodyM[0],
      posM[1] - eyeRelBodyM[1],
      posM[2] - eyeRelBodyM[2],
    ]),
    mat4dFromMat3(rotM),
  ) as Float64Array;
  return mat4d.multiply(slabVp, model) as Float64Array;
}
