import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { DragStep } from '../../@types/camera/DragStep';
import type { DraggedSurfacePose } from '../../@types/camera/DraggedSurfacePose';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { TILT_GAIN } from '../../data/camera/tiltGain';
import { anchoredDragRotation, MIN_INCIDENCE_COS } from './anchoredDragRotation';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { cursorRayBodyLocal } from './cursorRayBodyLocal';
import { pickOnBody } from './pickOnBody';
import { rotateBasisByQuat } from './rotateBasisByQuat';
import { rotatedAboutPoint } from './rotatedAboutPoint';
import { tiltFloorBudgetRad } from './tiltFloorBudgetRad';
import { dot3 } from '../math/dot3';
import { multiplyQuat } from '../math/multiplyQuat';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';
import { rotateVec3ByQuat } from '../math/rotateVec3ByQuat';

export function draggedSurfacePose(
  arm: BodyFixedPose,
  gesture: SurfaceGesture,
  step: DragStep,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
): DraggedSurfacePose {
  const currRay = cursorRayBodyLocal(arm, step.endPx, viewportPx, fovYRad);
  let mode = gesture.mode;

  if (mode === 'pan') {
    const prevRay = cursorRayBodyLocal(arm, gesture.prevPixel, viewportPx, fovYRad);
    const rotated = anchoredDragRotation(arm, prevRay, currRay, gesture.anchorRadiusM);
    if (rotated !== null) return { pose: rotated, mode };
    // A null answer covers a miss AND a grazing hit, and the two degrade
    // differently (C §2.6 / §6.4), so the incidence is re-measured here —
    // against the frozen sphere, never the display readout. Sticky either way.
    // The CURRENT ray decides alone: when it was the previous one that grazed,
    // the orbit is the honest answer for a gesture already at the limb.
    const graze = pickOnBody(currRay, gesture.anchorRadiusM);
    mode = graze !== null && Math.abs(graze.incidence) < MIN_INCIDENCE_COS ? 'strafe' : 'orbit';
  }

  // One rate law for every screen-mapped mode: the angle the pixel delta
  // subtends at the lens, so a drag of one screen height is one FOV of turn at
  // every altitude and no tuning constant exists to be wrong. Height scales
  // both axes, so x and y move at the same rate.
  const yawRad = ((step.endPx[0] - gesture.prevPixel[0]) / viewportPx[1]) * fovYRad;
  const pitchRad = ((step.endPx[1] - gesture.prevPixel[1]) / viewportPx[1]) * fovYRad;
  const b = arm.basisLocal;
  const right: Vec3 = [b[0], b[1], b[2]];

  if (mode === 'orbit') {
    // The pan continued past the limb on the frozen sphere: the pose orbits
    // the centre AGAINST the drag, which is what carries the grabbed limb
    // along with the cursor. The level settle in `apply` holds the entry
    // heading, so this is the north-locked orbit, not a free trackball.
    const up: Vec3 = [b[3], b[4], b[5]];
    const q = multiplyQuat(quatFromAxisAngle(right, -pitchRad), quatFromAxisAngle(up, -yawRad));
    return { pose: rotatedAboutPoint(arm, q, BODY_LOCAL_FRAME.centreM), mode };
  }

  if (mode === 'look') {
    // Yaw about the LOCAL vertical rather than the camera's own up: that is
    // what keeps the horizon level at every latitude and azimuth (probe
    // defect 3). The eye is not touched — this is the only route to the sky.
    const q = multiplyQuat(
      quatFromAxisAngle(right, pitchRad),
      quatFromAxisAngle(normalize3(bodyFixedEyeM(arm)), yawRad),
    );
    return { pose: { ...arm, basisLocal: rotateBasisByQuat(q, arm.basisLocal) }, mode };
  }

  const anchorM = gesture.anchorLocalM;
  // Both modes below latch an anchor, so this only keeps the arm total.
  if (anchorM === null) return { pose: arm, mode };

  if (mode === 'strafe') {
    // The plane through the anchor with the view axis as its normal (C §2.8):
    // translate by anchor − (this pixel's hit on it). Absolute against the
    // latched anchor, not incremental, so a long gesture accumulates no drift.
    const n: Vec3 = [b[6], b[7], b[8]];
    const denom = dot3(currRay.dir, n);
    if (denom === 0) return { pose: arm, mode };
    const t = (dot3(anchorM, n) - dot3(currRay.originM, n)) / denom;
    const e = arm.eyeRelAnchorM;
    return {
      pose: {
        ...arm,
        eyeRelAnchorM: [
          e[0] + anchorM[0] - (currRay.originM[0] + currRay.dir[0] * t),
          e[1] + anchorM[1] - (currRay.originM[1] + currRay.dir[1] * t),
          e[2] + anchorM[2] - (currRay.originM[2] + currRay.dir[2] * t),
        ],
      },
      mode,
    };
  }

  // Tilt, in the intrinsic Z-X-Z order KML specifies: heading about the
  // anchor's local up, THEN tilt about the ALREADY-YAWED east. Tilting about a
  // fixed screen axis instead drags ~10° of unwanted heading per 60 px (probe).
  const upLocal = normalize3(anchorM);
  // NEGATED heading on this handle (user feel ruling 15, 2026-09-03): a
  // right-drag rightward turns the view the OTHER way from the orbit drag —
  // deliberate, do not "fix" the sign back to match the pan convention.
  const heading = quatFromAxisAngle(upLocal, -yawRad);
  const radial = dot3(right, upLocal);
  const eastM = normalize3([
    right[0] - upLocal[0] * radial,
    right[1] - upLocal[1] * radial,
    right[2] - upLocal[2] * radial,
  ]);
  // Google-MAPS pitch mapping (user ruling 17, 2026-09-03, supersedes ruling
  // 16's Google-Earth sign): drag UP/away tilts up toward the horizon, so
  // `pitchRad`'s screen-space down-is-positive sign is NEGATED here. Ruling 16
  // briefly shipped the opposite (down-drag = tilt up); the user reversed it
  // same day. Do not "fix" this sign either way without a new ruling.
  // TILT_GAIN breaks the one-FOV-per-screen-height rate law for this handle
  // only: tilting spans ~90° of travel where orbit spans a hemisphere, so the
  // uniform rate reads as sluggish here (user feel ruling, 2026-09-03).
  //
  // Ruling 14: the tilt FLOOR at 0 is a dead stop, clamped at the gesture.
  // Only the lowering side (negative request) is bounded — by the exact
  // through-zero rotation about this axis, not by the tilt readout: an
  // unsigned acos cannot say which way is down and once bound the wrong side
  // entirely, leaving the crossing open and the memory following it (R13-1).
  // The raising side stays owned by the ceiling wall. The heading factor is
  // untouched: a mixed drag keeps its yaw live while the tilt dies.
  const tiltRequest = -pitchRad * TILT_GAIN;
  const fwdArm: Vec3 = [arm.basisLocal[6], arm.basisLocal[7], arm.basisLocal[8]];
  const tiltAngle =
    tiltRequest >= 0
      ? tiltRequest
      : Math.max(tiltRequest, -tiltFloorBudgetRad(fwdArm, bodyFixedEyeM(arm), anchorM, eastM));
  // Excess-only input is identity BY REFERENCE, not by arithmetic — the quat
  // path leaves −0 crumbs that would fail the ruled full-pose byte bar.
  if (tiltAngle === 0 && yawRad === 0) return { pose: arm, mode };
  const q = multiplyQuat(quatFromAxisAngle(rotateVec3ByQuat(heading, eastM), tiltAngle), heading);
  return { pose: rotatedAboutPoint(arm, q, anchorM), mode };
}
