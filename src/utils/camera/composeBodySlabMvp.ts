/**
 * composeBodySlabMvp — the `body-m` slab model compose. `composeBodyMvp` carries
 * `T·R·S` plus a `foregroundVp` rebase; here the seam (`BodyRelativePose`) has
 * already rotated the camera into the body's fixed axes and origined the eye,
 * so rotation and world-translation both drop. Metres, so the Mpc-magnitude
 * denormal class (spec §10) is unrepresentable rather than defended against.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';

/** vp · translate(−eyeRelBodyM) · scale(radiusM). Returns RAW f64 — caller narrows. */
export function composeBodySlabMvp(
  slabVp: Float64Array,
  eyeRelBodyM: Readonly<Vec3>,
  radiusM: number,
): Float64Array {
  const model = mat4d.multiply(
    mat4d.translation([-eyeRelBodyM[0], -eyeRelBodyM[1], -eyeRelBodyM[2]]),
    mat4d.scaling([radiusM, radiusM, radiusM]),
  ) as Float64Array;

  return mat4d.multiply(slabVp, model) as Float64Array;
}
