/**
 * zoomedPose — apply a wheel-zoom factor to a resting CameraPose.
 *
 * Scales `distance` by `factor` and clamps to the shared zoom envelope
 * (`clampDistance`); target, yaw, and pitch carry over unchanged. The target
 * is copied into a fresh array so the result never aliases the input pose's
 * (frozen, store-owned) target.
 *
 * `pivotRadiusMpc` is forwarded straight to the clamp — it is the radius of
 * whatever the pose orbits, so the floor stands off that body's surface (`null`
 * when there is no surface). It is threaded rather than defaulted because a
 * wheel tick under an active auto-rotate spins AROUND a focused body: the pose
 * this function zooms is pivoted on that body just as much as the follow
 * driver's is.
 *
 * Pure by design: the wheel handler reads `camera.base` from the store, hands
 * it here, and dispatches the result — so the zoom arithmetic (and its clamp
 * behaviour) is unit-testable without a store, a canvas, or a render loop.
 */

import { clampDistance } from './clampDistance';
import type { CameraPose } from '../../@types/camera/CameraPose';

export function zoomedPose(
  base: CameraPose,
  factor: number,
  pivotRadiusMpc: number | null,
): CameraPose {
  return {
    target: [base.target[0], base.target[1], base.target[2]],
    yaw: base.yaw,
    pitch: base.pitch,
    distance: clampDistance(base.distance * factor, pivotRadiusMpc),
  };
}
