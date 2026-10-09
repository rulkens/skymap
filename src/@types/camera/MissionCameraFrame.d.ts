/**
 * MissionCameraFrame — the zero-offset camera geometry of the mission frame: where the camera
 * looks (Mpc), the direction it looks along, the two axes the visitor's yaw and pitch turn
 * about, and the fitted distance (Mpc).
 */

import type { Vec3 } from '../math/Vec3';

export type MissionCameraFrame = {
  readonly aim: Vec3;
  readonly normal: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly distance: number;
};
