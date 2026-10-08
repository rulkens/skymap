/**
 * rideViewDirection — the unit direction the ride camera looks along: the encounter normal turned
 * by the visitor's yaw (toward `right`) and pitch (toward `up`). Zero offsets give the normal.
 */

import type { RideFrame } from '../../@types/camera/RideFrame';
import type { RideOffsets } from '../../@types/camera/RideOffsets';
import type { Vec3 } from '../../@types/math/Vec3';

export function rideViewDirection(frame: RideFrame, offsets: RideOffsets): Vec3 {
  const cp = Math.cos(offsets.pitch);
  const a = Math.cos(offsets.yaw) * cp;
  const b = Math.sin(offsets.yaw) * cp;
  const c = Math.sin(offsets.pitch);
  return [
    frame.normal[0] * a + frame.right[0] * b + frame.up[0] * c,
    frame.normal[1] * a + frame.right[1] * b + frame.up[1] * c,
    frame.normal[2] * a + frame.right[2] * b + frame.up[2] * c,
  ];
}
