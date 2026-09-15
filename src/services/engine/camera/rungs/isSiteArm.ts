/** Narrows a framed pose to a site arm — the turntable's four angles, not a
 *  body arm's anchor/basis. `isBodyArm`'s counterpart for the third rung. */
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import { rungKindOf } from './rungKindOf';

export function isSiteArm(framed: FramedCameraPose): framed is FramedPose<'site'> {
  return rungKindOf(framed.frame) === 'site';
}
