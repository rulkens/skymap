import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { mappedTiltRad } from './mappedTiltRad';
import { maxTiltRad } from './maxTiltRad';
import { orientStepRad } from './orientStepRad';
import { rotateBasisByQuat } from './rotateBasisByQuat';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * The drag path's tilt authority. The gesture's OWN excess past the ceiling is
 * simply not granted (a wall the drag presses against — motion stops, nothing
 * snaps); excess the pose ARRIVED with (a flyby, a clip end, a ceiling that
 * moved under a held pose) eases out by the bounded decay instead — C1's
 * one-tick 113° clamp is unrepresentable. Applied as a delta rotation about
 * the eye (basis only): enforcement never moves the eye (T17), and turning by
 * the residual leaves any not-yet-bled roll alone rather than discarding it.
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
  const localUp = normalize3(eyeM);
  const b = pose.basisLocal;
  const forward: Vec3 = [b[6], b[7], b[8]];
  const tiltRad = tiltFromNadirRad(forward, eyeM);

  // The gesture-time cap (ruling 12, reconciliation 1): a drag may not ADD
  // tilt past the altitude ramp, but the band-mapped display — remembered × w,
  // the zoom-time authority — is never treated as excess to erode; two
  // authorities fighting over the same tilt was the divergence class ruling
  // 10 outlawed.
  const hr = eyeMagM / bodyRadiusM - 1;
  const ceilingRad = Math.max(maxTiltRad(hr), mappedTiltRad(rememberedTiltRad, hr));
  const allowed = Math.min(tiltRad, Math.max(ceilingRad, Math.min(preTiltRad, tiltRad)));
  const target = allowed - orientStepRad(Math.max(0, allowed - ceilingRad));
  if (target >= tiltRad - 1e-15) return pose;

  // The residual's axis is the east of forward's own heading — `forward × up̂`
  // is `sin(tilt)` long along it; degenerate only at nadir, where tilt is 0.
  const axisRaw = cross3(forward, localUp);
  if (Math.hypot(...axisRaw) < 1e-12) return pose;
  // Turning by +φ about the east raises tilt, so the correction is negative.
  const q = quatFromAxisAngle(normalize3(axisRaw), target - tiltRad);
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
}
