/**
 * composeBodySlabCamRelVp — `composeBodySlabMvp` without the translation: clip
 * from a point given RELATIVE TO THE EYE in body-radius units. Same f64 seam,
 * same `view.slab.vp`, same `radiusM` — only the model's `−eyeRelBodyM` column
 * is gone, and the caller subtracts the eye itself.
 *
 * Dropping that column is the whole point. It is ~10^6 m on a planet, and once
 * narrowed to f32 its ulp is a quarter of a metre, so a surface point metres
 * from the eye comes out of `mvp · p` as the difference of two huge numbers and
 * lands a metre off. That is invisible on a body seen from space and fatal at
 * contact range: the analytic sphere's written depth then swallows (or floats
 * above) a mesh parked on the ground. Feeding the eye-relative offset through
 * this matrix instead keeps the whole chain small.
 */

import { mat4d } from 'wgpu-matrix';

/** vp · scale(radiusM). Returns RAW f64 — caller narrows. */
export function composeBodySlabCamRelVp(slabVp: Float64Array, radiusM: number): Float64Array {
  return mat4d.multiply(slabVp, mat4d.scaling([radiusM, radiusM, radiusM])) as Float64Array;
}
