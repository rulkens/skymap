import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { bodyUpWeight } from './bodyUpWeight';
import { eyeFrameOf } from './eyeFrameOf';
import { flooredBodyPose } from './flooredBodyPose';
import { levelledPose } from './levelledPose';
import { mappedTiltRad } from './mappedTiltRad';
import { orientStepRad } from './orientStepRad';
import { riddenOrientStepRad } from './riddenOrientStepRad';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { tiltTurnedPose } from './tiltTurnedPose';
import { turnedPose } from './turnedPose';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';
import { wrapRad } from '../math/wrapRad';

/**
 * The zoom path's orientation settle (R1 + rulings 5-12): every notch, both
 * directions — heading → north of the band-blended reference, tilt → the
 * remembered mapping, roll → level. `diveAnchorM !== null` IS the dive: its
 * turns pivot about the anchor so the dived-on point stays pixel-locked
 * (Q4c); a recession turns about the eye (anchor-pivoting there cancels
 * ~h/(R+h) of every correction, measured). `northUp` (ruling 11) gates
 * heading + roll only: the tilt term's 0-at-disengage is what keeps the
 * fold's retarget view-exact, toggle or no toggle.
 */
export function settledZoomPose(
  pose: BodyFixedPose,
  diveAnchorM: Readonly<Vec3> | null,
  bodyRadiusM: number,
  preTiltDevRad: number | null,
  sceneUpLocal: Readonly<Vec3>,
  preBlendAzimuthRad: number | null,
  rememberedTiltRad: number,
): BodyFixedPose {
  let out = pose;
  const eyeM0 = bodyFixedEyeM(out);
  if (Math.hypot(...eyeM0) === 0) return pose;
  // The reference is the band blend (round 5): body pole deep in, scene up at
  // disengage, so an engaged recession hands the fold a scene-aligned bake.
  const blendW = bodyUpWeight(Math.hypot(...eyeM0) / bodyRadiusM - 1);
  const f0 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f0 === null) return pose;

  if (ORIENT_TUNING.northUp) {
    // Dive: pure decay (rulings 5/7) about the anchor's radial through the
    // body centre — altitude untouched. Recession: the one discipline — the
    // reference's own band swing is notch-authored and rides; only deviation
    // the zoom did not author (`preBlendAzimuthRad`, measured at the
    // pre-notch pose against ITS reference) decays.
    const dPre = preBlendAzimuthRad ?? f0.azimuthRad;
    const dPsi = diveAnchorM
      ? orientStepRad(f0.azimuthRad)
      : riddenOrientStepRad(dPre, wrapRad(f0.azimuthRad - dPre), ORIENT_DECAY.rideBoundRad);
    if (dPsi !== 0) {
      out = diveAnchorM
        ? turnedPose(
            out,
            quatFromAxisAngle(normalize3(diveAnchorM), dPsi),
            BODY_LOCAL_FRAME.centreM,
          )
        : turnedPose(out, quatFromAxisAngle(f0.localUp, dPsi), null);
    }
  }

  // Ruling 12: display tilt is the pure function `remembered × w(h/R)` — a
  // notch never authors tilt, so the target's own move rides unbounded and
  // only an arrival deviation decays, capped (the 113°-snap protection).
  const eyeM1 = bodyFixedEyeM(out);
  const eyeMag1 = Math.hypot(...eyeM1);
  if (eyeMag1 !== 0) {
    const b = out.basisLocal;
    const devNew =
      tiltFromNadirRad([b[6], b[7], b[8]], eyeM1) -
      mappedTiltRad(rememberedTiltRad, eyeMag1 / bodyRadiusM - 1);
    const devPre = preTiltDevRad ?? devNew;
    out = tiltTurnedPose(out, -riddenOrientStepRad(devPre, devNew - devPre, Infinity), diveAnchorM);
  }

  if (ORIENT_TUNING.northUp) {
    out = levelledPose(out, { blendW, sceneUpLocal, heldAzimuthRad: null, pivotM: diveAnchorM });
  }
  // A tilt about a surface anchor holds |eye − anchor|, not |eye|.
  return flooredBodyPose(out, bodyRadiusM);
}
