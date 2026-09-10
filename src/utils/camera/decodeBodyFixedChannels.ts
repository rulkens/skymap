/**
 * decodeBodyFixedChannels — the four animation channels, read in one body's
 * FIXED axes, as a `BodyFixedPose`. `target` is a body-fixed point in metres,
 * `distance` a range in metres, `yaw`/`pitch` the orbit convention about the
 * body's own axes: `yawPitchToDir` points from the target TOWARD the eye, so
 * the aim is its negation (the same sign flip `reencodePose` documents).
 *
 * DECODED, never accumulated (spec §8) — the pole degeneracy that rules angles
 * out as camera state never reaches an authored keyframe. A body-framed
 * keyframe cannot express roll: there is no fifth channel to carry it.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { imagePlaneBasis } from './imagePlaneBasis';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { yawPitchToDir } from './yawPitchToDir';

export function decodeBodyFixedChannels(channels: CameraPose, bodyId: BodyId): BodyFixedPose {
  const { target, distance } = channels;
  const arm = yawPitchToDir(channels.yaw, channels.pitch);
  const eyeLocalM: Vec3 = [
    target[0] + arm[0] * distance,
    target[1] + arm[1] * distance,
    target[2] + arm[2] * distance,
  ];
  const forward: Vec3 = [-arm[0], -arm[1], -arm[2]];
  // Roll 0: the four channels carry no screen-up residual, so the basis is
  // levelled against the body's pole.
  const { right, up } = imagePlaneBasis(forward, 0, BODY_LOCAL_FRAME.pole);

  return {
    bodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: eyeLocalM,
    basisLocal: mat3FromColumns(right, up, forward),
  };
}
