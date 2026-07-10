/**
 * rebaseViewProj — re-express a view-projection so it consumes positions
 * measured RELATIVE to a chosen origin, and narrow it to f32 for GPU upload.
 *
 * ### The precision problem this solves
 *
 * The near-field slab's view-projection carries a large view translation:
 * roughly `-R·eye`, where the eye sits ~1 AU ≈ 4.85×10⁻¹² Mpc from the render
 * origin at solar-system zoom. An anchor near the eye (Earth, the Sun) sits at
 * a similarly-sized coordinate. Projecting it, `clip = vp · vec4(pos, 1)`,
 * subtracts two ~4.85×10⁻¹² numbers to recover the camera-relative position —
 * which at deep zoom is many orders of magnitude smaller (the camera can be
 * metres from the surface). In f32 the two terms agree to only ~4 digits, so
 * the difference is quantised onto a ~13 km grid: the anchor visibly hops as
 * the camera moves. This is CATASTROPHIC CANCELLATION driven by each term's
 * distance FROM THE ORIGIN, NOT by the (tiny) camera-to-anchor distance.
 *
 * Note that the number that kills precision is how far the eye and the anchor
 * are from the origin the vp was built around — not how close the camera is to
 * the anchor. Two points 30 m apart but 1 AU from the origin still cancel.
 *
 * ### The fix — rebase both operands into a small-number frame
 *
 * Pick a rebase origin `O` near the eye (the camera position is ideal: it
 * zeroes the view translation entirely). Then transform positions as
 * `pos - O` and use the matrix this function returns. The identity
 *
 *     rebased · vec4(pos - O, 1)  ≡  vp · vec4(pos, 1)
 *
 * holds exactly because `rebased = vp · translate(O)` and
 * `translate(O) · vec4(pos - O, 1) = vec4(pos, 1)`. The whole composition runs
 * in f64 (`mat4d`), so the large-vs-small cancellation is resolved at double
 * precision; only the final, already-well-conditioned matrix is narrowed to
 * f32. With `O = eye` the returned matrix has NO large translation left to
 * cancel against, and `pos - O` is a small camera-relative vector — both
 * operands the shader multiplies are now well-conditioned.
 *
 * This is the label-anchor sibling of `composeBodyMvp`: that helper bakes the
 * anchor into a per-body MVP in f64; this one leaves the anchor as a shader
 * input but hands the shader a frame in which f32 suffices.
 *
 * @param vpF64         The slab's f64 proj·view (`view.slab.vp` — never the
 *                      f32-narrowed `view.vp`, whose bits are already lost).
 * @param rebaseOrigin  The origin to measure positions relative to, in the
 *                      same frame as `vpF64` (the camera position zeroes the
 *                      view translation and is the strongest choice).
 * @returns  A length-16 column-major `Float32Array`, ready for GPU upload,
 *           that pairs with `pos - rebaseOrigin` position inputs.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';
import { narrowMat4 } from '../math/narrowMat4';

export function rebaseViewProj(vpF64: Float64Array, rebaseOrigin: Readonly<Vec3>): Float32Array {
  // vp · translate(O): a column-vector v transforms as (vp·T)·v, so applying
  // this to vec4(pos - O, 1) first re-adds O (recovering pos) then projects —
  // identical math to vp·vec4(pos,1), but composed in f64 before any narrowing.
  const rebased = mat4d.multiply(
    vpF64,
    mat4d.translation([rebaseOrigin[0], rebaseOrigin[1], rebaseOrigin[2]]),
  ) as Float64Array;

  // Narrow once at the GPU-upload boundary. With the cancellation resolved in
  // f64, each f32 element is well-conditioned (2^-24 relative rounding at worst).
  return narrowMat4(rebased);
}
