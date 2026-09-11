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

export function composeMeshMvp(
  slabVp: Float64Array,
  posM: Readonly<Vec3>,
  eyeRelBodyM: Readonly<Vec3>,
  rotM: Readonly<Mat3>,
): Float64Array {
  // Hand embed of the tight 9-element `Mat3`: wgpu-matrix's own mat3 is a
  // 12-float PADDED layout (columns at 0/4/8), so `mat4d.fromMat3` would read
  // the wrong slots, and columns placed transposed mirror the body with no
  // compiler check. Same trap `composeBodyMvp` documents.
  const rot = new Float64Array([
    rotM[0],
    rotM[1],
    rotM[2],
    0,
    rotM[3],
    rotM[4],
    rotM[5],
    0,
    rotM[6],
    rotM[7],
    rotM[8],
    0,
    0,
    0,
    0,
    1,
  ]);
  const model = mat4d.multiply(
    mat4d.translation([
      posM[0] - eyeRelBodyM[0],
      posM[1] - eyeRelBodyM[1],
      posM[2] - eyeRelBodyM[2],
    ]),
    rot,
  ) as Float64Array;
  return mat4d.multiply(slabVp, model) as Float64Array;
}
