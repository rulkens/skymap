/**
 * applyWheelZoom — route a wheel-zoom factor to whichever owner authors the camera
 * distance, keyed on the PREVIOUS frame's winning driver (the wheel fires between
 * frames, so last frame's winner is this frame's too).
 *
 *   - followBody re-asserts its own distance target every frame and would swallow
 *     a committed base, so the wheel edits that target in place.
 *   - autoRotate: the spin epoch restarts on any base-identity change, so
 *     committing an un-spun base pops the yaw — zoom the already-spun pose.
 */

import { spinAutoRotate } from './spinAutoRotate';
import { zoomedDistance } from '../../../utils/camera/zoomedDistance';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

/** `autoRotateElapsedMs` is the caller's read of the spin epoch at this instant. */
export function applyWheelZoom(
  runtime: Pick<CameraRuntime, 'follow'>,
  prevActiveId: string,
  base: FramedCameraPose,
  factor: number,
  autoRotateRate: number,
  autoRotateElapsedMs: number,
  pivot: PivotFraming,
): CameraPose | null {
  // World arm only (spec §7): in a body arm the wheel routes to the surface gesture.
  if (base.frame !== 'absolute') return null;
  const follow = runtime.follow;
  if (prevActiveId === 'followBody' && follow !== null && follow.distanceTarget !== null) {
    runtime.follow = {
      ...follow,
      distanceTarget: zoomedDistance(follow.distanceTarget, factor, pivot),
    };
    return null;
  }
  if (prevActiveId === 'autoRotate') {
    return zoomedPose(
      spinAutoRotate(base.pose, autoRotateRate, autoRotateElapsedMs),
      factor,
      pivot,
    );
  }
  return zoomedPose(base.pose, factor, pivot);
}
