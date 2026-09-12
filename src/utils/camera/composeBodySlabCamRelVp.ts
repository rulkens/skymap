/**
 * composeBodySlabCamRelVp — `composeBodySlabMvp` without the translation: clip
 * from a point given RELATIVE TO THE EYE in body-radius units. Same f64 seam,
 * same `view.slab.vp`, same `radiusM` — only the model's `−eyeRelBodyM` column
 * is gone, and the caller subtracts the eye itself, avoiding the ~0.02–0.10 m
 * f32 cancellation error that column costs at contact range (see
 * `lib/analyticSphere.wesl`'s depth section).
 */

import { mat4d } from 'wgpu-matrix';

/** vp · scale(radiusM). Returns RAW f64 — caller narrows. */
export function composeBodySlabCamRelVp(slabVp: Float64Array, radiusM: number): Float64Array {
  return mat4d.multiply(slabVp, mat4d.scaling([radiusM, radiusM, radiusM])) as Float64Array;
}
