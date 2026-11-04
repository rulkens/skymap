/** Narrows a framed pose to a sky arm — a standing eye's azimuth and altitude. */
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import { cameraArmKindOf } from './cameraArmKindOf';

export function isSkyArm(framed: FramedCameraPose): framed is FramedPose<'sky'> {
  return cameraArmKindOf(framed.frame) === 'sky';
}
