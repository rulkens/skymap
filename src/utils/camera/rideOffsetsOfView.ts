/**
 * rideOffsetsOfView — the inverse of `rideViewDirection` plus the zoom: which yaw, pitch and
 * distance multiplier put the camera on the view a released drag left behind.
 */

import type { RideFrame } from '../../@types/camera/RideFrame';
import type { RideOffsets } from '../../@types/camera/RideOffsets';
import type { Vec3 } from '../../@types/math/Vec3';
import { dot3 } from '../math/dot3';

export function rideOffsetsOfView(
  frame: RideFrame,
  viewDir: Readonly<Vec3>,
  distance: number,
): RideOffsets {
  return {
    yaw: Math.atan2(dot3(viewDir, frame.right), dot3(viewDir, frame.normal)),
    pitch: Math.asin(Math.max(-1, Math.min(1, dot3(viewDir, frame.up)))),
    zoom: distance / frame.distance,
  };
}
