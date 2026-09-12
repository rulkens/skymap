/**
 * composeBodySlabCamRelVp — `composeBodySlabMvp` without the translation: clip
 * from a point given RELATIVE TO THE EYE in body-radius units. That missing
 * `−eyeRelBodyM` column is the f32 cancellation at contact range — see
 * `lib/analyticSphere.wesl`'s depth section.
 */

import { mat4d } from 'wgpu-matrix';

/** vp · scale(radiusM). Returns RAW f64 — caller narrows. */
export function composeBodySlabCamRelVp(slabVp: Float64Array, radiusM: number): Float64Array {
  return mat4d.multiply(slabVp, mat4d.scaling([radiusM, radiusM, radiusM])) as Float64Array;
}
