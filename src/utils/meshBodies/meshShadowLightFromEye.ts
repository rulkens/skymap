/**
 * meshShadowLightFromEye — a site body's light matrix for a point given relative to the EYE in
 * the host's fixed axes (a surface tile fragment's `−viewDirLocal · radiusM`):
 * `lightFromLocal · translate(eyeRelBodyM − posM)`. Composed in f64 so the eye-to-body offset
 * cancels before anything is narrowed; narrow at the write.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';

export function meshShadowLightFromEye(
  lightFromLocal: Float64Array,
  eyeRelBodyM: Readonly<Vec3>,
  posM: Readonly<Vec3>,
): Float64Array {
  const localFromEye = mat4d.translation([
    eyeRelBodyM[0] - posM[0],
    eyeRelBodyM[1] - posM[1],
    eyeRelBodyM[2] - posM[2],
  ]);
  return mat4d.multiply(lightFromLocal, localFromEye) as Float64Array;
}
