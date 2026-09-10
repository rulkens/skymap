/**
 * clipFrameChannels — move a keyframe leg's START between frames, through the
 * §5.1 pair in `poseFrameConversion`. Called ONCE per leg, never per frame:
 * re-converting each frame would walk the start along with the body.
 *
 * The pair is lossless in the EYE and the camera basis but carries no orbit
 * pivot, so the target crosses as a POINT through provider A and the range
 * falls out of the two. Coming back, `toWorldArm`'s graze rule re-derives the
 * pivot, so a round trip keeps the eye and the aim exactly and may slide the
 * target along the unchanged sightline. Nothing here converts Mpc↔metres
 * itself — that stays the seam's alone (spec §10, `oneMpcSeam`).
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import { bodyFixedEyeM } from '../../../utils/camera/bodyFixedEyeM';
import { decodeBodyFixedChannels } from '../../../utils/camera/decodeBodyFixedChannels';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { bodyRelativePose } from './bodyRelativePose';
import { toBodyArm, resolveWorldArm } from './poseFrameConversion';

/** Absolute Mpc channels → the same camera in `bodyId`'s fixed axes, metres. */
export function toBodyFixedChannels(
  pose: CameraPose,
  bodyId: BodyId,
  bodies: ReadonlyMap<BodyId, BodyState>,
  basis: Readonly<Mat3>,
): CameraPose {
  const bodyState = bodies.get(bodyId);
  if (bodyState === undefined) {
    throw new Error(`toBodyFixedChannels: body '${bodyId}' is unresolved this instant`);
  }
  const eyeArm = toBodyArm(pose, basis, basis, bodyId, bodyState);
  const eyeM = bodyFixedEyeM(eyeArm);
  // The target is a POINT in the same world frame as the eye, so it crosses to
  // metres through provider A directly; only `eyeRelBodyM` is meaningful for a
  // point, so the basis argument is inert.
  const target = bodyRelativePose({
    camPosMpc: pose.target,
    camBasisWorld: IDENTITY_MAT3,
    bodyState,
  }).eyeRelBodyM;
  const forward: Vec3 = [eyeArm.basisLocal[6], eyeArm.basisLocal[7], eyeArm.basisLocal[8]];
  const { yaw, pitch } = orbitAnglesLookingAlong(forward);
  return {
    target,
    yaw,
    pitch,
    distance: Math.hypot(eyeM[0] - target[0], eyeM[1] - target[1], eyeM[2] - target[2]),
  };
}

/** Body-fixed metre channels → absolute Mpc channels. */
export function fromBodyFixedChannels(
  channels: CameraPose,
  bodyId: BodyId,
  bodies: ReadonlyMap<BodyId, BodyState>,
  basis: Readonly<Mat3>,
): CameraPose {
  return resolveWorldArm(
    { frame: { body: bodyId }, pose: decodeBodyFixedChannels(channels, bodyId) },
    bodies,
    basis,
    basis,
  );
}
