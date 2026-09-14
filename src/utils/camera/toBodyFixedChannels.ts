/**
 * Move a keyframe leg's START into a body's frame, through the §5.1 pair in
 * `poseFrameConversion`; the body rung's `channels` cell owns the once-per-leg
 * landmine. Nothing here converts Mpc↔metres — that stays the seam's alone
 * (spec §10, `oneMpcSeam`).
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { IDENTITY_MAT3 } from '../math/identityMat3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { decodeBodyFixedChannels } from './decodeBodyFixedChannels';
import { orbitAnglesLookingAlong } from './orbitAnglesLookingAlong';
import { bodyRelativePose } from '../../services/engine/camera/bodyRelativePose';
import { toBodyArm } from '../../services/engine/camera/poseFrameConversion';
import { foldToWorld } from '../../services/engine/camera/rungs/foldToWorld';
import { hostOrThrow } from '../../services/engine/camera/rungs/hostOrThrow';

/** Absolute Mpc channels → the same camera in `bodyId`'s fixed axes, metres. */
export function toBodyFixedChannels(
  pose: CameraPose,
  bodyId: BodyId,
  bodies: ReadonlyMap<BodyId, BodyState>,
  basis: Readonly<Mat3>,
): CameraPose {
  const bodyState = hostOrThrow(
    { body: bodyId },
    { bodies, poseBasis: basis, upBasis: basis },
  ).state;
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
  return foldToWorld(
    { frame: { body: bodyId }, pose: decodeBodyFixedChannels(channels, bodyId) },
    { bodies, poseBasis: basis, upBasis: basis },
  );
}
