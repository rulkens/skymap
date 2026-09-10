/**
 * clipFrameChannels — move a keyframe leg's START between frames, through the
 * §5.1 pair in `poseFrameConversion`. Called ONCE per leg, never per frame:
 * re-converting each frame would walk the start along with the body.
 *
 * The pair is lossless in the EYE and the camera basis but carries no orbit
 * pivot, so the target crosses as a POINT through the same seam and the range
 * falls out of the two. Coming back, `toWorldArm`'s graze rule re-derives the
 * pivot, so a round trip keeps the eye and the aim exactly and may slide the
 * target along the unchanged sightline. Nothing here converts Mpc↔metres
 * itself — that stays the pair's alone (spec §10, `oneMpcSeam`).
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { bodyFixedEyeM } from '../../../utils/camera/bodyFixedEyeM';
import { decodeBodyFixedChannels } from '../../../utils/camera/decodeBodyFixedChannels';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { toBodyArm, toWorldArm } from './poseFrameConversion';

function bodyRadiusM(bodyId: BodyId): number {
  const row = SCENE_BODIES.find((b) => b.id === bodyId);
  if (row === undefined) throw new Error(`clipFrameChannels: no scene body '${bodyId}'`);
  return row.radiusM;
}

/** Absolute Mpc channels → the same camera in `bodyId`'s fixed axes, metres. */
export function toBodyFixedChannels(
  pose: CameraPose,
  bodyId: BodyId,
  bodyState: BodyState,
  basis: Readonly<Mat3>,
): CameraPose {
  const eyeArm = toBodyArm(pose, basis, basis, bodyId, bodyState);
  // The target is a POINT in the same world frame as the eye, so it crosses to
  // metres through the very same seam: a zero-range pose parks the eye on it.
  // That pose's own basis is degenerate and deliberately unread.
  const targetArm = toBodyArm({ ...pose, distance: 0 }, basis, basis, bodyId, bodyState);
  const eyeM = bodyFixedEyeM(eyeArm);
  const target = bodyFixedEyeM(targetArm);
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
  bodyState: BodyState,
  basis: Readonly<Mat3>,
): CameraPose {
  return toWorldArm(
    decodeBodyFixedChannels(channels, bodyId),
    bodyState,
    basis,
    basis,
    bodyRadiusM(bodyId),
  );
}
