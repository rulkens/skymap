import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { PivotFraming } from '../../@types/camera/PivotFraming';
import type { Mat3 } from '../../@types/math/Mat3';
import { PITCH_LIMIT } from '../../data/camera/pitchLimit';
import { applyInputToCamera } from '../../services/camera/applyInputToCamera';

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
  // The VIEW pitch is orbit + offset; past ±π/2 its basis flips. Only the offset
  // gives way (the orbit pitch is the drag law's), and the clamp runs after an
  // orbit too, which can raise the pitch under a held offset.
  if (next.lookOffset === undefined) return next;
  const [offsetYaw, offsetPitch] = next.lookOffset;
  const clamped = Math.max(
    -PITCH_LIMIT - next.pitch,
    Math.min(PITCH_LIMIT - next.pitch, offsetPitch),
  );
  return clamped === offsetPitch ? next : { ...next, lookOffset: [offsetYaw, clamped] };
}
