/**
 * timelineOffsetsOfView — the inverse of `timelineViewDirection` plus the zoom: which yaw, pitch and
 * distance multiplier put the camera on the view a released drag left behind.
 */

import type { TimelineCameraFrame } from '../../../@types/camera/timeline/TimelineCameraFrame';
import type { TimelineOffsets } from '../../../@types/camera/timeline/TimelineOffsets';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import { dot3 } from '../../math/dot3';

export function timelineOffsetsOfView(
  frame: TimelineCameraFrame,
  viewDir: Readonly<Vec3>,
  distance: number,
): TimelineOffsets {
  return {
    yaw: Math.atan2(dot3(viewDir, frame.right), dot3(viewDir, frame.viewDirection)),
    pitch: Math.asin(Math.max(-1, Math.min(1, dot3(viewDir, frame.up)))),
    zoom: distance / frame.distance,
  };
}
