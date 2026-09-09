import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { bodyUpWeight } from './bodyUpWeight';
import { canonicalBasisAt } from './canonicalBasisAt';
import { cappedRotationToward } from './cappedRotationToward';
import { eyeFrameOf } from './eyeFrameOf';
import { flooredBodyPose } from './flooredBodyPose';
import { mappedTiltRad } from './mappedTiltRad';
import { orientStepRad } from './orientStepRad';
import { poseWithBasisTurn } from './poseWithBasisTurn';
import { riddenOrientStepRad } from './riddenOrientStepRad';
import { rotatedAboutPoint } from './rotatedAboutPoint';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * The zoom path's orientation settle (R1 + rulings 5-12): every notch, both
 * directions, walks heading → north and roll → level by the one bounded
 * decay; tilt tracks the pure function `remembered × w(h/R)` (ruling 12 —
 * the tilt-block comment below carries the discipline), direction-blind and
 * structurally 0 at the disengage boundary, which is what keeps the fold's
 * retarget view-exact.
 *
 * `diveAnchorM !== null` IS the dive: its corrections are rigid rotations
 * about axes THROUGH the anchor — camera-space coordinates invariant (Q4c),
 * the dived-on point pixel-locked, and the shrinking eye–anchor range lands
 * the corrections in full by the ground. A recession (null) turns the basis
 * about the EYE: anchor-pivoting there is self-defeating — the eye orbits
 * the anchor and the standpoint's own ENU turn cancels ~h/(R+h) of every
 * correction (measured: 0.071 rad commanded, 0.023 achieved at h = 2R) —
 * and FW-H never promised recession-orientation pixels anyway; the position
 * step above still pins the cursor point (ruling 7). The dive's heading axis
 * runs through the body centre too, so altitude is untouched; a tilt about a
 * surface anchor holds `|eye − anchor|`, not `|eye|`, hence the floor
 * resample at the end.
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
  // The reference up this settle norths toward is the BAND BLEND (round 5):
  // the body pole deep in, the scene up at the disengage boundary — so an
  // engaged recession hands the fold a scene-aligned screen-up by
  // construction, and the bake it commits carries ≈0 scene roll.
  const eyeM0 = bodyFixedEyeM(out);
  if (Math.hypot(...eyeM0) === 0) return pose;
  const blendW = bodyUpWeight(Math.hypot(...eyeM0) / bodyRadiusM - 1);
  const f0 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f0 === null) return pose;
  // Dive: bounded decay toward north-of-ref — the ENU turning under a moving
  // eye is not notch-authored, so it eases (ruled smooth; near the anchor
  // `d(azimuth)/dδ ≈ −1`, further off scaled by `Â·up̂`, always the right
  // sign). Recession: the ONE settle discipline (`riddenOrientStepRad`,
  // ruling 10 — shared with the world arm's roll ride): the reference's own
  // band swing (and a cursor-anchored notch's ENU turn) is notch-authored and
  // rides; only deviation the zoom did not author (`preBlendAzimuthRad`,
  // measured at the pre-notch pose against ITS reference) decays, capped.
  // Feeding the whole residual to the decay is the freeze the round-5 sim
  // measured.
  // `northUp` (ruling 11 trial) gates heading + roll authority ONLY — the
  // tilt block below stays live: its tilt-0-at-disengage wall is what keeps
  // the fold retarget view-exact, toggle or no toggle.
  const dPsi = !ORIENT_TUNING.northUp
    ? 0
    : diveAnchorM
      ? orientStepRad(f0.azimuthRad)
      : (() => {
          const dPre = preBlendAzimuthRad ?? f0.azimuthRad;
          const moveRaw = Math.atan2(
            Math.sin(f0.azimuthRad - dPre),
            Math.cos(f0.azimuthRad - dPre),
          );
          return riddenOrientStepRad(dPre, moveRaw);
        })();
  if (dPsi !== 0) {
    const q = quatFromAxisAngle(diveAnchorM ? normalize3(diveAnchorM) : f0.localUp, dPsi);
    out = diveAnchorM
      ? rotatedAboutPoint(out, q, BODY_LOCAL_FRAME.centreM)
      : poseWithBasisTurn(out, q);
  }

  const f1 = eyeFrameOf(out, blendW, sceneUpLocal);
  if (f1 !== null) {
    // Ruling 12 (Cesium-style remembered tilt): display tilt is the PURE
    // FUNCTION `remembered × w(h/R)` — a zoom notch never authors tilt, it
    // only moves h/R along a continuous, degeneracy-free curve, so the
    // target's own move rides IN FULL (no continuity bound: bounding it
    // would let a fast recession cross disengage with tilt and break the
    // scene-aligned bake — w = 0 there keeps the fold retarget view-exact
    // by construction). Deviation the zoom did not author (an arrival pose)
    // decays by the capped share — the 113°-snap protection, measured
    // against the band target now that the old ceiling wall is gone. Both
    // directions alike; the dive still pivots about its anchor (Q4c).
    const eyeM1 = bodyFixedEyeM(out);
    const devNew =
      f1.tiltRad - mappedTiltRad(rememberedTiltRad, Math.hypot(...eyeM1) / bodyRadiusM - 1);
    const devPre = preTiltDevRad ?? devNew;
    const dTau = devNew - devPre + orientStepRad(devPre);
    const b = out.basisLocal;
    const axisRaw = cross3([b[6], b[7], b[8]], f1.localUp);
    const axisLen = Math.hypot(...axisRaw);
    // At exact nadir the east-of-forward axis vanishes; a RAISING correction
    // (the lerp-in toward a remembered tilt) tips about the screen-right —
    // the axis the tilt handle itself drags about at that pose.
    const axis: Vec3 | null =
      axisLen > 1e-12
        ? [axisRaw[0] / axisLen, axisRaw[1] / axisLen, axisRaw[2] / axisLen]
        : dTau < 0
          ? [b[0], b[1], b[2]]
          : null;
    if (dTau !== 0 && axis !== null) {
      const q = quatFromAxisAngle(axis, -dTau);
      out = diveAnchorM ? rotatedAboutPoint(out, q, diveAnchorM) : poseWithBasisTurn(out, q);
    }
  }

  if (ORIENT_TUNING.northUp) {
    const f2 = eyeFrameOf(out, blendW, sceneUpLocal);
    if (f2 !== null) {
      const q = cappedRotationToward(
        out.basisLocal,
        canonicalBasisAt(f2, f2.azimuthRad, f2.tiltRad),
        ORIENT_DECAY.capRad,
      );
      if (q !== null)
        out = diveAnchorM ? rotatedAboutPoint(out, q, diveAnchorM) : poseWithBasisTurn(out, q);
    }
  }
  return flooredBodyPose(out, bodyRadiusM);
}
