/** Narrows a framed pose to a site arm — the turntable's four angles, not a
 *  body arm's anchor/basis. `isBodyArm`'s counterpart for the third arm. */
import type { FramedCameraPose } from '../../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../../@types/camera/FramedPose';
import { cameraArmKindOf } from '../cameraArmKindOf';

export function isSiteArm(framed: FramedCameraPose): framed is FramedPose<'site'> {
  return cameraArmKindOf(framed.frame) === 'site';
}
