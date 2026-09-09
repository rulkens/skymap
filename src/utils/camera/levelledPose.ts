import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { canonicalBasisAt } from './canonicalBasisAt';
import { cappedRotationToward } from './cappedRotationToward';
import { eyeFrameOf } from './eyeFrameOf';
import { rotateBasisByQuat } from './rotateBasisByQuat';

/**
 * The drag path's level settle: rotate the basis toward the roll-free pose at
 * its own standpoint, capped. Pan (and its limb continuation) passes the
 * heading it entered the step with, so a curved drag path cannot rotate the
 * image — holonomy roll is corrected the step it appears (R1: no gesture may
 * introduce roll), while an arriving roll eases out over a few inputs rather
 * than snapping. Below the cap the correction is FULL, which is what makes
 * gesture-created roll unrepresentable rather than merely damped.
 */
export function levelledPose(pose: BodyFixedPose, heldAzimuthRad: number | null): BodyFixedPose {
  const frame = eyeFrameOf(pose, 1, BODY_LOCAL_FRAME.pole);
  if (frame === null) return pose;
  const target = canonicalBasisAt(frame, heldAzimuthRad ?? frame.azimuthRad, frame.tiltRad);
  const q = cappedRotationToward(pose.basisLocal, target, ORIENT_DECAY.capRad);
  if (q === null) return pose;
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
}
