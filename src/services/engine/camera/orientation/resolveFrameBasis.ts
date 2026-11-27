/**
 * resolveFrameBasis — the single authority for the camera's orientation basis B(t): the steady
 * registry basis when no frame roll is in flight, else where the roll stands (`frameRollQuatAt`).
 */

import type { Mat3 } from '../../../../@types/math/Mat3';
import type { OrientationFrameId } from '../../../../@types/camera/orientation/OrientationFrameId';
import type { FrameTween } from '../../../../@types/camera/focusMotion/FrameTween';
import { ORIENTATION_FRAMES } from '../../../../data/orientation/orientationFrames';
import { quaternionToMatrix } from '../../../../utils/math/quaternionToMatrix';
import { frameRollQuatAt } from './frameRollQuatAt';

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

  const { durationMs } = frameTween;
  // A 0 ms tween is a `frameTo` snap: at elapsed 0 the fraction would be 0/0.
  const u = durationMs > 0 ? frameTweenElapsedMs / durationMs : 1;
  const q = frameRollQuatAt(frameTween.fromQuat, frameTween.to, frameTween.easing, u);
  return quaternionToMatrix(q);
}
