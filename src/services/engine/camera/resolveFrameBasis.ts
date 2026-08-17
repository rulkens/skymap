/**
 * resolveFrameBasis — the single authority for the camera's resolved
 * orientation basis B(t), evaluated once per frame.
 *
 *   (orientation, frameTween, clock, nowMs)  →  (this module)  →  Mat3 basis
 *   Mat3 basis                               →  camera up      →  view matrix
 *
 * There is exactly one place that answers 'which way is up this frame', so no
 * two call sites can drift on how a frame roll is interpolated. When no roll is
 * in flight the answer is the steady registry basis for the current orientation;
 * during a roll it is the slerp between the basis captured at switch start
 * (`frameTween.fromQuat`) and the destination frame's basis, reshaped by the
 * tween's easing and clamped so an over-elapsed frame settles on the endpoint
 * rather than overshooting.
 *
 * ### Why slerp on quaternions rather than lerp on matrices
 *
 * Both endpoints are proper rotations. Linearly blending their matrices leaves
 * the intermediate non-orthonormal (columns neither unit-length nor mutually
 * perpendicular), which shears the rendered sky mid-transition. Spherical
 * interpolation of the unit quaternions stays on the rotation manifold, so every
 * sampled midpoint is itself a proper rotation. `quat.slerp` /
 * `mat3.fromQuat` come from wgpu-matrix (same library the view-projection path
 * uses) — no hand-rolled slerp.
 *
 * ### Layout bridge: 12-float mat3 → 9-float registry Mat3
 *
 * wgpu-matrix stores a `mat3` as three vec4-padded columns (12 floats, padding
 * at indices 3, 7, 11) to match WGSL's `mat3x3` memory layout. The registry's
 * `Mat3` is a tight 9-float column-major tuple. This module strips the padding
 * so callers see the registry shape, keeping the padded representation an
 * implementation detail of the interpolation step.
 *
 * ### Steady branch returns a copy, not the registry object
 *
 * On the null-tween path we clone `ORIENTATION_FRAMES[orientation]` rather than
 * hand the registry entry out directly. The registry is shared, module-level,
 * frozen-by-convention truth; returning a fresh array means a caller that (say)
 * writes the basis into a scratch buffer can never mutate the source. The
 * interpolated branch already allocates a fresh array, so this keeps the return
 * contract uniform: the caller always owns the array it receives.
 */

import { quat, mat3 } from 'wgpu-matrix';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';
import type { FrameTween } from '../../../@types/camera/FrameTween';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../data/orientation/orientationFrames';
import { EASE } from '../animation/ease';
import { frameTweenElapsed } from './cameraClock';

/** Strip wgpu-matrix's vec4 column padding (indices 3, 7, 11) to a tight Mat3. */
function toRegistryMat3(padded: Float32Array | number[]): Mat3 {
  return [
    padded[0]!,
    padded[1]!,
    padded[2]!,
    padded[4]!,
    padded[5]!,
    padded[6]!,
    padded[8]!,
    padded[9]!,
    padded[10]!,
  ];
}

/**
 * Resolve the orientation basis for this frame.
 *
 * Total by construction: a null `frameTween` yields the steady registry basis;
 * otherwise the eased slerp parameter is clamped to [0, 1] by the `EASE`
 * functions, so an elapsed value at or beyond `durationMs` returns the
 * destination frame's basis exactly.
 */
export function resolveFrameBasis(
  orientation: OrientationFrameId,
  frameTween: FrameTween | null,
  clock: CameraClock,
  nowMs: number,
): Mat3 {
  if (frameTween === null) {
    // Copy so callers never mutate the shared registry entry (see module header).
    return [...ORIENTATION_FRAMES[orientation]];
  }

  const elapsed = frameTweenElapsed(clock, frameTween, nowMs);
  const t = EASE[frameTween.easing](elapsed / frameTween.durationMs);
  const q = quat.slerp(frameTween.fromQuat, ORIENTATION_FRAME_QUATERNIONS[frameTween.to], t);
  return toRegistryMat3(mat3.fromQuat(q));
}
