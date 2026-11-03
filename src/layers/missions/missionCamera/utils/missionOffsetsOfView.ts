/**
 * missionOffsetsOfView — the inverse of `missionViewDirection` plus the zoom: which yaw, pitch and
 * distance multiplier put the camera on the view a released drag left behind.
 */

import type { MissionCameraFrame } from '../@types/MissionCameraFrame';
import type { MissionOffsets } from '../@types/MissionOffsets';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { dot3 } from '../../../../utils/math/dot3';

export function missionOffsetsOfView(
  frame: MissionCameraFrame,
  viewDir: Readonly<Vec3>,
  distance: number,
): MissionOffsets {
  return {
    yaw: Math.atan2(dot3(viewDir, frame.right), dot3(viewDir, frame.viewDirection)),
    pitch: Math.asin(Math.max(-1, Math.min(1, dot3(viewDir, frame.up)))),
    zoom: distance / frame.distance,
  };
}
