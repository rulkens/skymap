/**
 * resolveFrameBasis — the single authority for the camera's orientation
 * basis B(t): the steady registry basis when no frame roll is in flight,
 * else the slerp from the basis captured at switch start (`fromQuat`) to the
 * destination frame's, eased and clamped to the endpoint. Quaternion slerp,
 * not matrix lerp: a blended matrix is non-orthonormal mid-roll and shears
 * the sky; slerp stays on the rotation manifold (`quat.slerp` /
 * `mat3.fromQuat` from wgpu-matrix, the view-projection path's library).
 */

import { quat, mat3 } from 'wgpu-matrix';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';
import type { FrameTween } from '../../../@types/camera/FrameTween';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../data/orientation/orientationFrames';
import { EASE } from '../animation/ease';

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

/** Total: a null tween is the steady basis; `EASE` clamps to [0, 1], so an
 * over-elapsed roll settles on the destination exactly. */
export function resolveFrameBasis(
  orientation: OrientationFrameId,
  frameTween: FrameTween | null,
  frameTweenElapsedMs: number,
): Mat3 {
  if (frameTween === null) {
    // A copy: the registry entry is shared, callers own what they get.
    return [...ORIENTATION_FRAMES[orientation]];
  }

  const t = EASE[frameTween.easing](frameTweenElapsedMs / frameTween.durationMs);
  const q = quat.slerp(frameTween.fromQuat, ORIENTATION_FRAME_QUATERNIONS[frameTween.to], t);
  return toRegistryMat3(mat3.fromQuat(q));
}
