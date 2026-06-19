/**
 * CameraPose — the orbit params that camera drivers produce: target, angles, distance.
 *
 * An immutable snapshot of the camera's current 3D state in orbit-camera space.
 * All drivers (mouse input, tour storyboard, animated tweens) converge to this shape.
 */

import type { Vec3 } from '../math/Vec3';

export type CameraPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
};
