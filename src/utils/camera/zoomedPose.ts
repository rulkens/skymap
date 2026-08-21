/**
 * zoomedPose — apply a `ZoomStep` to a resting CameraPose.
 *
 * Distance scales, the pivot takes the step's world-space lateral shift, and
 * yaw/pitch carry over unchanged (zoom-to-cursor is orientation-preserving by
 * construction). The target is copied into a fresh array so the result never
 * aliases the input pose's (frozen, store-owned) target.
 *
 * `clampDistance`'s floor is a BACKSTOP here, not the surface stop: the real
 * standoff floor is enforced in eye currency inside `zoomedEyeStep`. It stays
 * because a lateral shift only ever moves `target` PERPENDICULAR to the view
 * axis, which grows `distance` relative to the centred case — so this floor can
 * never cut a legal zoom short, only catch a pathological one.
 */

import { clampDistance } from './clampDistance';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { ZoomStep } from '../../@types/camera/ZoomStep';

export function zoomedPose(
  base: CameraPose,
  step: ZoomStep,
  pivotRadiusMpc: number | null,
): CameraPose {
  return {
    target: [
      base.target[0] + step.lateralMpc[0],
      base.target[1] + step.lateralMpc[1],
      base.target[2] + step.lateralMpc[2],
    ],
    yaw: base.yaw,
    pitch: base.pitch,
    distance: clampDistance(base.distance * step.distanceScale, pivotRadiusMpc),
  };
}
