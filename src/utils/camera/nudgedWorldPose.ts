import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { PivotFraming } from '../../@types/camera/PivotFraming';
import type { Mat3 } from '../../@types/math/Mat3';
import { PITCH_LIMIT } from '../../data/camera/pitchLimit';
import { applyInputToCamera } from '../../services/camera/applyInputToCamera';
import { zoomedDistance } from './zoomedDistance';

/**
 * The world arm's pixel-free motion, axes in the order zoom → orbit → look →
 * roll. Orbit goes back through the drag's own pixel law (altitude damping and
 * pitch clamp included) so a nudge and its equivalent drag cannot drift apart.
 * `cssHeight` is the CSS height, as for the drag.
 */
export function nudgedWorldPose(
  pose: CameraPose,
  delta: ArmDelta,
  cssHeight: number,
  pivot: PivotFraming,
  fovYRad: number,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): CameraPose {
  const { orbit, look, zoom, roll } = delta;
  if (orbit === undefined && look === undefined && zoom === undefined && roll === undefined) {
    return pose;
  }
  let next = pose;
  if (zoom !== undefined) {
    next = { ...next, distance: zoomedDistance(next.distance, Math.exp(zoom), pivot) };
  }
  if (orbit !== undefined) {
    const pxPerRad = cssHeight / fovYRad;
    next = applyInputToCamera(
      next,
      {
        kind: 'drag',
        mode: 'orbit',
        startPx: [0, 0],
        endPx: [orbit[0] * pxPerRad, orbit[1] * pxPerRad],
      },
      cssHeight,
      pivot,
      fovYRad,
      poseBasis,
      upBasis,
    );
  }
  if (look !== undefined) {
    const [yaw, pitch] = next.lookOffset ?? [0, 0];
    next = {
      ...next,
      lookOffset: [yaw + look[0], Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + look[1]))],
    };
  }
  if (roll !== undefined) next = { ...next, roll: (next.roll ?? 0) + roll };
  return next;
}
