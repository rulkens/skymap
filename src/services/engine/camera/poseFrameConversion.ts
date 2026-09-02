/**
 * poseFrameConversion — the lossless world arm ↔ body arm pair (spec §5.1).
 *
 * Entering captures NOTHING time-dependent — no epoch, no orientation snapshot
 * — so co-rotation is a property of the storage and a fast clock cannot move
 * the engaged pose. Leaving bakes the rotation back out and re-derives the
 * orbit parameterization; `roll` carries the screen-up residual the eye alone
 * cannot express (spec §12-R1), which is what makes the pair exact for ANY
 * pose. Second and last user of the Mpc↔metre constants here (spec §10).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { BodyFixedPose } from '../../../@types/camera/BodyFixedPose';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { yawPitchToDir } from '../../../utils/camera/yawPitchToDir';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { rollFromScreenUp } from '../../../utils/camera/rollFromScreenUp';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';
import { normalize3 } from '../../../utils/math/normalize3';
import { raySphereRoots } from '../../../utils/math/raySphereRoots';
import { surfaceFloorM } from '../../../utils/camera/surfaceFloorM';
import { bodyRelativePose } from './bodyRelativePose';

const BODY_CENTRE: Vec3 = [0, 0, 0];

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function toBodyArm(
  pose: CameraPose,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  bodyId: BodyId,
  bodyState: BodyState,
): BodyFixedPose {
  // The world eye and camera basis exactly as `frameContext` derives them:
  // `updatePosition`'s two steps (frame-local decode, then rotate by the
  // STEADY `poseBasis`), then the image-plane basis over the possibly
  // mid-slerp `upBasis`. Re-deriving either convention here would let a body
  // row's screen orientation drift from NEAR0's.
  const dirWorld = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), poseBasis);
  const camPosMpc: Vec3 = [
    pose.target[0] + dirWorld[0] * pose.distance,
    pose.target[1] + dirWorld[1] * pose.distance,
    pose.target[2] + dirWorld[2] * pose.distance,
  ];
  const forward = normalize3([
    pose.target[0] - camPosMpc[0],
    pose.target[1] - camPosMpc[1],
    pose.target[2] - camPosMpc[2],
  ]);
  const { right, up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(upBasis));

  // Provider A IS the Mpc→metre seam, so the body arm reuses it rather than
  // repeating the subtract-then-scale ordering the precision depends on
  // (spec §5.2: both providers agree at the flip because it is one derivation).
  const { eyeRelBodyM, basisM } = bodyRelativePose({
    camPosMpc,
    camBasisWorld: mat3FromColumns(right, up, forward),
    bodyState,
  });

  // Anchor at the body centre (spec §5.3, ruled S2): re-anchoring is a separate
  // operation, so the first landing stores the eye whole.
  return { bodyId, anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeRelBodyM, basisLocal: basisM };
}

export function toWorldArm(
  pose: BodyFixedPose,
  bodyState: BodyState,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  bodyRadiusM: number,
): CameraPose {
  const { anchorLocalM, eyeRelAnchorM, basisLocal } = pose;
  const eyeLocalM: Vec3 = [
    anchorLocalM[0] + eyeRelAnchorM[0],
    anchorLocalM[1] + eyeRelAnchorM[1],
    anchorLocalM[2] + eyeRelAnchorM[2],
  ];
  const forwardLocal: Vec3 = [basisLocal[6], basisLocal[7], basisLocal[8]];
  const eyeMagM = Math.hypot(eyeLocalM[0], eyeLocalM[1], eyeLocalM[2]);

  // The target stays ON the forward ray whatever the sightline does, so the
  // view axis IS `forwardLocal` and crossing the limb cannot turn the pose.
  // Range is the near root on a hit and the closest approach `t*` on a miss —
  // continuously the same number, since `t* − √disc → t*` at tangency (Cesium's
  // `grazingAltitudeLocation`, prior-art Q1). Re-aiming at the body centre on a
  // miss is what popped the scene by `asin(R/d)`.
  const roots = raySphereRoots(eyeLocalM, forwardLocal, BODY_CENTRE, bodyRadiusM);
  const grazingM = -dot3(eyeLocalM, forwardLocal);
  // Floored at the eye's altitude — the scale `cam.distance` consumers want
  // when the ray points at sky, and positive, which the encoding needs to carry
  // a direction at all. It cannot reopen the crossing: `t* = √(d²−R²) ≥ d−R`
  // there. `eyeMagM`'s own floor guards only an eye at or below the surface,
  // which the surface arm's descent floor already stands off from.
  const rangeM = Math.max(
    roots === null ? grazingM : roots[0],
    Math.max(eyeMagM, surfaceFloorM(bodyRadiusM)) - bodyRadiusM,
  );
  const armLocalM: Vec3 = [
    forwardLocal[0] * rangeM,
    forwardLocal[1] * rangeM,
    forwardLocal[2] * rangeM,
  ];

  const { orientation, positionMpc } = bodyState;
  const targetWorldM = rotateVec3ByTightMat3(
    [eyeLocalM[0] + armLocalM[0], eyeLocalM[1] + armLocalM[1], eyeLocalM[2] + armLocalM[2]],
    orientation,
  );
  const target: Vec3 = [
    positionMpc[0] + targetWorldM[0] * SCALE_UNITS.M_TO_MPC,
    positionMpc[1] + targetWorldM[1] * SCALE_UNITS.M_TO_MPC,
    positionMpc[2] + targetWorldM[2] * SCALE_UNITS.M_TO_MPC,
  ];
  // Measured in body-fixed metres, never as a difference of two heliocentric
  // Mpc positions: the range keeps full f64 relative precision that way.
  const distance = Math.hypot(armLocalM[0], armLocalM[1], armLocalM[2]) * SCALE_UNITS.M_TO_MPC;

  // The orbit convention aims the camera AT its target, so the reconstructed
  // view axis is the arm — `forwardLocal` in world, exactly, at every range.
  const viewDirWorld = normalize3(rotateVec3ByTightMat3(armLocalM, orientation));
  // `orbitAnglesLookingAlong` predates the readonly-basis convention and takes
  // a mutable `Mat3`; it only reads the nine cells.
  const { yaw, pitch } = orbitAnglesLookingAlong(viewDirWorld, poseBasis as Mat3);
  const upWorld = rotateVec3ByTightMat3([basisLocal[3], basisLocal[4], basisLocal[5]], orientation);

  return {
    target,
    yaw,
    pitch,
    distance,
    roll: rollFromScreenUp(viewDirWorld, upWorld, frameUp(upBasis)),
  };
}

/**
 * The world arm of a framed pose. The absolute arm returns its own pose BY
 * REFERENCE — the fold is free on every world-arm frame, which is what lets
 * `runFrame` resolve unconditionally instead of branching (spec §7 step 6).
 *
 * Throws when the engaged body has no state or no registry row this instant:
 * a body arm is only ever created for a body the roster resolved, so this is
 * unreachable by construction and a silent fallback would teleport the camera.
 */
export function resolveWorldArm(
  framed: FramedCameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): CameraPose {
  if (framed.frame === 'absolute') return framed.pose;
  const bodyId = framed.frame.body;
  const bodyState = bodyStates.get(bodyId);
  const body = SCENE_BODIES.find((row) => row.id === bodyId);
  if (bodyState === undefined || body === undefined) {
    throw new Error(`resolveWorldArm: engaged body '${bodyId}' is unresolved this instant`);
  }
  return toWorldArm(framed.pose, bodyState, poseBasis, upBasis, body.radiusM);
}
