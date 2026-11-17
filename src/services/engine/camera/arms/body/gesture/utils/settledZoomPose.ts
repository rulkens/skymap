import type { BodyFixedPose } from '../../../../../../../@types/camera/pose/BodyFixedPose';
import type { CameraTuning } from '../../../../../../../@types/camera/orbitCamera/CameraTuning';
import type { GroundRadiusLookup } from '../../../../../../../@types/camera/terrain/GroundRadiusLookup';
import type { Vec3 } from '../../../../../../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../../../../../../data/camera/bodyLocalFrame';
import { ORIENT_DECAY } from '../../../../data/orientDecay';
import { bodyFixedEyeM } from '../../../../../../../utils/camera/surfaceFrame/bodyFixedEyeM';
import { bodyUpWeight } from '../../../../orientation/utils/bodyUpWeight';
import { eyeFrameOf } from '../../../../../../../utils/camera/surfaceFrame/eyeFrameOf';
import { flooredBodyPose } from '../../utils/flooredBodyPose';
import { levelledPose } from '../../../../orientation/utils/levelledPose';
import { mappedTiltRad } from '../../../../orientation/utils/mappedTiltRad';
import { orientStepRad } from '../../../../orientation/utils/orientStepRad';
import { riddenOrientStepRad } from '../../../../orientation/utils/riddenOrientStepRad';
import { tiltFromNadirRad } from '../../../../../../../utils/camera/surfaceFrame/tiltFromNadirRad';
import { tiltTurnedPose } from '../../../../orientation/utils/tiltTurnedPose';
import { turnedPose } from '../../../../orientation/utils/turnedPose';
import { normalize3 } from '../../../../../../../utils/math/normalize3';
import { quatFromAxisAngle } from '../../../../../../../utils/math/quatFromAxisAngle';
import { wrapRad } from '../../../../../../../utils/math/wrapRad';

/**
 * The zoom path's orientation settle (R1 + rulings 5-12): every notch, both
 * directions — heading → north of the band-blended reference, tilt → the
 * remembered mapping, roll → level. All three turn about `pivotM`, the point
 * the zoom holds, so it stays pixel-locked (Q4c); `null` — no focus, no dive
 * anchor — turns about the eye instead. `diving` is the DIRECTION, and only
 * the heading term's ride/decay discipline reads it. `northUp` (ruling 11)
 * gates heading + roll only: the tilt term's 0-at-disengage is what keeps the
 * fold's retarget view-exact, toggle or no toggle. Every settle amount here is
 * priced in `logZoom` (`|ln factor|`), so a trackpad twitch and a mouse notch
 * of equal total zoom converge on the same orientation (`ORIENT_DECAY`).
 */
export function settledZoomPose(
  pose: BodyFixedPose,
  pivotM: Readonly<Vec3> | null,
  diving: boolean,
  bodyRadiusM: number,
  standoffRadii: number,
  groundRadiusAtM: GroundRadiusLookup,
  preTiltDevRad: number | null,
  sceneUpLocal: Readonly<Vec3>,
  preBlendAzimuthRad: number | null,
  rememberedTiltRad: number,
  logZoom: number,
  tuning: CameraTuning,
): BodyFixedPose {
  let out = pose;
  const eyeM0 = bodyFixedEyeM(out);
  if (Math.hypot(...eyeM0) === 0) return pose;
  // The reference is the band blend (round 5): body pole deep in, scene up at
  // disengage, so an engaged recession hands the fold a scene-aligned bake.
  const blendW = bodyUpWeight(Math.hypot(...eyeM0) / bodyRadiusM - 1, tuning);
  const f0 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f0 === null) return pose;

  if (tuning.northUp) {
    // Dive: pure decay (rulings 5/7) about the anchor's radial through the
    // body centre — altitude untouched. Recession: the one discipline — the
    // reference's own band swing is notch-authored and rides; only deviation
    // the zoom did not author (`preBlendAzimuthRad`, measured at the
    // pre-notch pose against ITS reference) decays.
    const dPre = preBlendAzimuthRad ?? f0.azimuthRad;
    const dPsi = diving
      ? orientStepRad(f0.azimuthRad, logZoom)
      : riddenOrientStepRad(
          dPre,
          wrapRad(f0.azimuthRad - dPre),
          ORIENT_DECAY.rideBoundRad,
          logZoom,
        );
    if (dPsi !== 0) {
      out = pivotM
        ? turnedPose(out, quatFromAxisAngle(normalize3(pivotM), dPsi), BODY_LOCAL_FRAME.centreM)
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
      mappedTiltRad(rememberedTiltRad, eyeMag1 / bodyRadiusM - 1, tuning);
    const devPre = preTiltDevRad ?? devNew;
    out = tiltTurnedPose(
      out,
      -riddenOrientStepRad(devPre, devNew - devPre, Infinity, logZoom),
      pivotM,
    );
  }

  if (tuning.northUp) {
    out = levelledPose(out, {
      blendW,
      sceneUpLocal,
      heldAzimuthRad: null,
      pivotM,
      capRad: ORIENT_DECAY.capRadPerLogZoom * Math.abs(logZoom),
    });
  }
  // A tilt about a surface anchor holds |eye − anchor|, not |eye| — so the
  // floor undoes it about the same pivot, which is what keeps the lock.
  return flooredBodyPose(out, groundRadiusAtM, standoffRadii, pivotM);
}
