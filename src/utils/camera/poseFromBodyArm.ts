/**
 * The engaged body's `BodyRelativePose`, straight from the stored body-fixed
 * pose: the anchor fold `eyeRelBodyM = anchorLocalM + eyeRelAnchorM` is the
 * whole conversion — no Mpc, no rotation, no cancellation to manage, which is
 * the point of storing the pose anchor-relative (spec §5.3).
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { BodyRelativePose } from '../../@types/engine/camera/BodyRelativePose';
import { bodyFixedEyeM } from './bodyFixedEyeM';

export function poseFromBodyArm(pose: BodyFixedPose): BodyRelativePose {
  return { eyeRelBodyM: bodyFixedEyeM(pose), basisM: pose.basisLocal };
}
