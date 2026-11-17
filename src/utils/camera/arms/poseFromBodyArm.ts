/** The engaged body's `BodyRelativePose` straight from the stored pose: the
 * anchor fold `eyeRelBodyM = anchorLocalM + eyeRelAnchorM` is the WHOLE
 * conversion — no Mpc, no rotation, no cancellation (spec §5.3). */

import type { BodyFixedPose } from '../../../@types/camera/pose/BodyFixedPose';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import { bodyFixedEyeM } from '../surfaceFrame/bodyFixedEyeM';

export function poseFromBodyArm(pose: BodyFixedPose): BodyRelativePose {
  return { eyeRelBodyM: bodyFixedEyeM(pose), basisM: pose.basisLocal };
}
