import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { EyeFrame } from '../../@types/camera/EyeFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { blendedEnuAt } from './blendedEnuAt';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { refAzimuthOf } from './refAzimuthOf';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { normalize3 } from '../math/normalize3';

/**
 * The pose's orientation readout in the band-blended reference ENU
 * (`blendedEnuAt` — one home, shared with the debug readout): `blendW = 1` is
 * the pure body ENU (every drag site), lower weights swing north toward the
 * scene up across the hysteresis window (the zoom settle, round 5/6).
 */
export function eyeFrameOf(
  pose: BodyFixedPose,
  blendW: number,
  sceneUpLocal: Readonly<Vec3>,
): EyeFrame | null {
  const eyeM = bodyFixedEyeM(pose);
  if (Math.hypot(...eyeM) === 0) return null; // no ENU exists at the centre
  const localUp = normalize3(eyeM);
  const b = pose.basisLocal;
  const forward: Vec3 = [b[6], b[7], b[8]];
  const up: Vec3 = [b[3], b[4], b[5]];
  // The pose's own screen-up is the hold-and-transport carry: inside the
  // blend's singular neighbourhood the reference is wherever the settle
  // already put the view (round 7) — stateless, and consistent between the
  // pre-notch and post-notch measures because both read their own pose.
  const { east, north } = blendedEnuAt(localUp, blendW, sceneUpLocal, up);
  const tiltRad = tiltFromNadirRad(forward, eyeM);
  return {
    localUp,
    tiltRad,
    east,
    north,
    azimuthRad: refAzimuthOf(localUp, forward, up, east, north),
  };
}
