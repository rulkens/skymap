/**
 * decodeBodyFixedChannels — the animation channels read in one body's FIXED
 * axes. `target` is a body-fixed point in METRES, `distance` a range in metres,
 * `yaw`/`pitch` the orbit convention about the body's own axes: `yawPitchToDir`
 * points from the target TOWARD the eye, so the aim is its negation (the sign
 * flip `reencodePose` documents).
 *
 * DECODED, never accumulated (spec §8). `roll` turns screen-up about the aim
 * from the body's pole, so a leg keeps the heading its start carried in.
 */

import type { SceneBodyId } from '../../../../../../@types/scene/SceneBodyId';
import type { BodyFixedPose } from '../../../../../../@types/camera/pose/BodyFixedPose';
import type { CameraPose } from '../../../../../../@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../../../../../data/camera/bodyLocalFrame';
import { imagePlaneBasis } from '../../../../../../utils/camera/orbitPose/imagePlaneBasis';
import { mat3FromColumns } from '../../../../../../utils/math/mat3FromColumns';
import { yawPitchToDir } from '../../../../../../utils/camera/orbitPose/yawPitchToDir';

export function decodeBodyFixedChannels(channels: CameraPose, bodyId: SceneBodyId): BodyFixedPose {
  const { target, distance } = channels;
  const arm = yawPitchToDir(channels.yaw, channels.pitch);
  const eyeLocalM: Vec3 = [
    target[0] + arm[0] * distance,
    target[1] + arm[1] * distance,
    target[2] + arm[2] * distance,
  ];
  const forward: Vec3 = [-arm[0], -arm[1], -arm[2]];
  const { right, up } = imagePlaneBasis(forward, channels.roll ?? 0, BODY_LOCAL_FRAME.pole);

  return {
    bodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: eyeLocalM,
    basisLocal: mat3FromColumns(right, up, forward),
  };
}
