/** Narrows a framed pose to a body arm — what a display asking for body-fixed
 *  metres means, now that a site rung's pose is four angles and a range. */
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import { rungKindOf } from './rungKindOf';

export function isBodyArm(framed: FramedCameraPose): framed is FramedPose<'body'> {
  return rungKindOf(framed.frame) === 'body';
}
