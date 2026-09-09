import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { mappedTiltRad } from './mappedTiltRad';
import { maxTiltRad } from './maxTiltRad';
import { orientStepRad } from './orientStepRad';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { tiltTurnedPose } from './tiltTurnedPose';

/**
 * The drag path's tilt authority: the gesture's OWN excess past the ceiling is
 * not granted (a wall — motion stops, nothing snaps); excess the pose ARRIVED
 * with (a flyby, a clip end, a ceiling that moved under a held pose) eases out
 * by the bounded decay, so C1's one-tick 113° clamp is unrepresentable. About
 * the eye (T17) and by the residual, so a not-yet-bled roll survives.
 */
export function walledTiltPose(
  pose: BodyFixedPose,
  preTiltRad: number,
  bodyRadiusM: number,
  rememberedTiltRad: number,
): BodyFixedPose {
  const eyeM = bodyFixedEyeM(pose);
  const eyeMagM = Math.hypot(...eyeM);
  if (eyeMagM === 0) return pose;
  const b = pose.basisLocal;
  const tiltRad = tiltFromNadirRad([b[6], b[7], b[8]], eyeM);

  // Ruling 12, reconciliation 1: a drag may not ADD tilt past the altitude
  // ramp, but the band-mapped display (the zoom-time authority) is never
  // treated as excess to erode — two authorities over one tilt is what ruling
  // 10 outlawed.
  const hr = eyeMagM / bodyRadiusM - 1;
  const ceilingRad = Math.max(maxTiltRad(hr), mappedTiltRad(rememberedTiltRad, hr));
  const allowed = Math.min(tiltRad, Math.max(ceilingRad, Math.min(preTiltRad, tiltRad)));
  const target = allowed - orientStepRad(Math.max(0, allowed - ceilingRad));
  if (target >= tiltRad - 1e-15) return pose;
  return tiltTurnedPose(pose, target - tiltRad, null);
}
