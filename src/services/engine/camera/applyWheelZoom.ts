/**
 * applyWheelZoom — route a wheel-zoom factor to whichever owner authors the camera
 * distance, keyed on the PREVIOUS frame's winning driver (the wheel fires between
 * frames, so last frame's winner is this frame's too).
 *
 *   - followBody re-asserts its own distance target every frame and would swallow
 *     a committed base, so the wheel edits that target in place.
 *   - autoRotate: `autoRotateElapsed` restarts on any base-identity change, so
 *     committing an un-spun base pops the yaw — zoom the already-spun pose.
 */

import { autoRotateElapsed } from './cameraClock';
import { spinAutoRotate } from './spinAutoRotate';
import { zoomedDistance } from '../../../utils/camera/zoomedDistance';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function applyWheelZoom(
  clock: CameraClock,
  prevActiveId: string,
  base: FramedCameraPose,
  factor: number,
  autoRotate: { active: boolean; rate: number },
  nowMs: number,
  pivot: PivotFraming,
): CameraPose | null {
  // World arm only (spec §7): in a body arm the wheel routes to the surface gesture.
  if (base.frame !== 'absolute') return null;
  if (prevActiveId === 'followBody' && clock.followDistanceTarget !== null) {
    clock.followDistanceTarget = zoomedDistance(clock.followDistanceTarget, factor, pivot);
    return null;
  }
  if (prevActiveId === 'autoRotate') {
    // The REAL active bit, not a constant: with auto-rotate switched off between
    // frames the elapsed reads 0 and this degrades to the plain zoomed base.
    const elapsed = autoRotateElapsed(clock, autoRotate.active, base, nowMs);
    return zoomedPose(spinAutoRotate(base.pose, autoRotate.rate, elapsed), factor, pivot);
  }
  return zoomedPose(base.pose, factor, pivot);
}
