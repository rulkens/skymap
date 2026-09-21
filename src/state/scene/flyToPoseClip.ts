/**
 * flyToPoseClip — a view's pose-addressed establishing-move clip, the sibling
 * of `flyToClip.ts`'s `FocusId`-addressed builder. A focus has no bearing
 * (the camera keeps whatever it had); a view's pose is hand-framed, so
 * `aimAt` carries yaw/pitch here where `flyToClip` has none.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import { aimAt, all, dollyTo, moveTarget } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds. */
const FLY_SEC = 5;

export function flyToPoseClip(pose: CameraPose): ClipData {
  return {
    start: 'live',
    timeline: [
      all([
        moveTarget(pose.target, FLY_SEC, 'easeInOutCubic'),
        dollyTo(pose.distance, FLY_SEC, 'easeInOutCubic'),
        aimAt({ yaw: pose.yaw, pitch: pose.pitch }, FLY_SEC, 'easeInOutCubic'),
      ]),
    ],
  };
}
