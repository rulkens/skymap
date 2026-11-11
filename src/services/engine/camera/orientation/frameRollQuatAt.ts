import { quat } from 'wgpu-matrix';
import { ORIENTATION_FRAME_QUATERNIONS } from '../../../../data/orientation/orientationFrames';
import { EASE } from '../../animation/ease';
import type { Vec4 } from '../../../../@types/math/Vec4';
import type { Ease } from '../../../../@types/animation/Ease';
import type { OrientationFrameId } from '../../../../@types/camera/orientation/OrientationFrameId';

/**
 * The up-basis quaternion a frame roll from `fromQuat` to `to` stands at, `u` of the way in time.
 * Slerp, not matrix lerp: a blended matrix is non-orthonormal mid-roll and shears the sky.
 */
export function frameRollQuatAt(
  fromQuat: Vec4,
  to: OrientationFrameId,
  easing: Ease,
  u: number,
): Vec4 {
  const q = quat.slerp(fromQuat, ORIENTATION_FRAME_QUATERNIONS[to], EASE[easing](u));
  return [q[0]!, q[1]!, q[2]!, q[3]!];
}
