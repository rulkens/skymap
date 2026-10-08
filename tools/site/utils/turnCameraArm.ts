import type { FramedPose } from '../../../src/@types/camera/FramedPose';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';

/** The camera arm turned `dyaw` radians about its target: the yaw of a world pose, the heading of a site's turntable. A body-fixed pose has no single angle to turn. */
export function turnCameraArm(arm: FramedPose, dyaw: number): FramedPose {
  if (arm.frame === 'absolute') return absoluteArm({ ...arm.pose, yaw: arm.pose.yaw + dyaw });
  if ('site' in arm.frame && 'headingRad' in arm.pose) {
    return { frame: arm.frame, pose: { ...arm.pose, headingRad: arm.pose.headingRad + dyaw } };
  }
  throw new Error('cannot turn a body-fixed camera pose');
}
