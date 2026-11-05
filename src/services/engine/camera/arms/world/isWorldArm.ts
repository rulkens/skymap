/** Narrows a framed pose to the world arm. */
import type { FramedCameraPose } from '../../../../../@types/camera/pose/FramedCameraPose';
import type { FramedPose } from '../../../../../@types/camera/pose/FramedPose';

export function isWorldArm(framed: FramedCameraPose): framed is FramedPose<'absolute'> {
  return framed.frame === 'absolute';
}
