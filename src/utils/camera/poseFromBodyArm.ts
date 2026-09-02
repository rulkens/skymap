/**
 * poseFromBodyArm — provider B: the engaged body's `BodyRelativePose`,
 * straight from the stored body-fixed pose.
 *
 * The anchor fold is the whole conversion: `eyeRelBodyM = anchorLocalM +
 * eyeRelAnchorM`. No Mpc, no rotation, no cancellation to manage — the whole
 * point of storing the pose anchor-relative (spec §5.3) is that this add is
 * the only arithmetic standing between it and the seam every body-local
 * render pass already reads (`BodyRelativePose`).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { BodyRelativePose } from '../../@types/engine/camera/BodyRelativePose';

export function poseFromBodyArm(pose: BodyFixedPose): BodyRelativePose {
  const { anchorLocalM, eyeRelAnchorM, basisLocal } = pose;
  const eyeRelBodyM: Vec3 = [
    anchorLocalM[0] + eyeRelAnchorM[0],
    anchorLocalM[1] + eyeRelAnchorM[1],
    anchorLocalM[2] + eyeRelAnchorM[2],
  ];
  return { eyeRelBodyM, basisM: basisLocal };
}
