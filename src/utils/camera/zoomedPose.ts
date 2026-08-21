/**
 * zoomedPose — apply a `ZoomStep` to a resting CameraPose.
 *
 * Distance scales, the pivot takes the step's world-space lateral shift, and
 * yaw/pitch carry over unchanged (zoom-to-cursor is orientation-preserving by
 * construction). The target is copied into a fresh array so the result never
 * aliases the input pose's (frozen, store-owned) target.
 *
 * The surface stop is NOT here: it is enforced in eye currency inside
 * `zoomedEyeStep`, the only currency that survives the pivot strafing off the
 * body centre — which is exactly what the lateral term below does. All
 * `clampDistance` contributes is the envelope (ceiling + positivity).
 */

import { clampDistance } from './clampDistance';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { ZoomStep } from '../../@types/camera/ZoomStep';

export function zoomedPose(base: CameraPose, step: ZoomStep): CameraPose {
  return {
    target: [
      base.target[0] + step.lateralMpc[0],
      base.target[1] + step.lateralMpc[1],
      base.target[2] + step.lateralMpc[2],
    ],
    yaw: base.yaw,
    pitch: base.pitch,
    distance: clampDistance(base.distance * step.distanceScale),
  };
}
