/**
 * missionViewDirection — the unit direction the mission camera looks along: the frame's normal
 * turned by the visitor's yaw (toward `right`) and pitch (toward `up`). Zero offsets give the normal.
 */

import type { MissionCameraFrame } from '../../@types/camera/MissionCameraFrame';
import type { MissionOffsets } from '../../@types/camera/MissionOffsets';
import type { Vec3 } from '../../@types/math/Vec3';

export function missionViewDirection(frame: MissionCameraFrame, offsets: MissionOffsets): Vec3 {
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
