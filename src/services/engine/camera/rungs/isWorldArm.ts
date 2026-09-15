/** Narrows a framed pose to the world arm. */
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';

export function isWorldArm(framed: FramedCameraPose): framed is FramedPose<'absolute'> {
  return framed.frame === 'absolute';
}
