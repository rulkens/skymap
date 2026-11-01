import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { PivotFraming } from '../../@types/camera/PivotFraming';
import type { Mat3 } from '../../@types/math/Mat3';
import { PITCH_LIMIT } from '../../data/camera/pitchLimit';
import { applyInputToCamera } from '../../services/camera/applyInputToCamera';
import { dot3 } from '../math/dot3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { frameUp } from './frameUp';
import { yawPitchToDir } from './yawPitchToDir';

/**
 * The world arm's pixel-free motion, axes in the order orbit → look → roll;
 * zoom is `absoluteRung.step`'s, run by the rung first. Orbit goes back through the drag's own pixel law (altitude damping and
 * pitch clamp included) so a nudge and its equivalent drag cannot drift apart.
 * `cssHeight` is the CSS height, as for the drag.
 */
export function nudgedWorldPose(
  pose: CameraPose,
  delta: Omit<ArmDelta, 'zoom'>,
  cssHeight: number,
  pivot: PivotFraming,
  fovYRad: number,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): CameraPose {
  const { orbit, look, roll } = delta;
  if (orbit === undefined && look === undefined && roll === undefined) {
    return pose;
  }
  let next = pose;
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
    next = { ...next, lookOffset: [yaw + look[0], pitch + look[1]] };
  }
  if (roll !== undefined) next = { ...next, roll: (next.roll ?? 0) + roll };
  // The offset pitch turns the view about `frameUp(upBasis)`, so the rendered
  // elevation is e + offset, where e is the un-offset forward's: the NEGATED
  // `poseBasis` decode (it points target → eye), not `pose.pitch`. Only the
  // offset gives way (the orbit pitch is the drag law's), after an orbit too.
  if (next.lookOffset === undefined) return next;
  const back = rotateVec3ByTightMat3(yawPitchToDir(next.yaw, next.pitch), poseBasis);
  const e = Math.asin(Math.max(-1, Math.min(1, -dot3(back, frameUp(upBasis)))));
  const [offsetYaw, offsetPitch] = next.lookOffset;
  const clamped = Math.max(-PITCH_LIMIT - e, Math.min(PITCH_LIMIT - e, offsetPitch));
  return clamped === offsetPitch ? next : { ...next, lookOffset: [offsetYaw, clamped] };
}
