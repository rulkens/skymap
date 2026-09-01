/**
 * zoomedPose — apply a wheel-zoom factor to a resting CameraPose.
 *
 * Scales `distance` by `factor` via `zoomedDistance` — geometric steps in
 * altitude above the pivot's surface when there is one, plain proportional
 * scaling when there isn't — and clamps to the shared zoom envelope; target,
 * yaw, and pitch carry over unchanged. The target is copied into a fresh array
 * so the result never aliases the input pose's (frozen, store-owned) target.
 *
 * `pivot` is forwarded straight to `zoomedDistance` — it describes whatever
 * the pose orbits, so the taper (and the floor beneath it) stand off that
 * body's surface. It is threaded rather than defaulted because a wheel tick
 * under an active auto-rotate spins AROUND a focused body: the pose this
 * function zooms is pivoted on that body just as much as the follow driver's
 * is.
 *
 * Pure by design: the wheel handler reads `camera.base` from the store, hands
 * it here, and dispatches the result — so the zoom arithmetic (and its clamp
 * behaviour) is unit-testable without a store, a canvas, or a render loop.
 */

import { zoomedDistance } from './zoomedDistance';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { PivotFraming } from '../../@types/camera/PivotFraming';

export function zoomedPose(base: CameraPose, factor: number, pivot: PivotFraming): CameraPose {
  return {
    target: [base.target[0], base.target[1], base.target[2]],
    yaw: base.yaw,
    pitch: base.pitch,
    distance: zoomedDistance(base.distance, factor, pivot),
  };
}
