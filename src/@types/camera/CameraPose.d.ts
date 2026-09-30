/**
 * CameraPose — the orbit params that camera drivers produce: target, angles, distance.
 *
 * An immutable snapshot of the camera's current 3D state in orbit-camera space.
 * All drivers (mouse input, tour storyboard, animated tweens) converge to this shape.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type CameraPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  /**
   * Roll about the view axis, radians. Absent ⇒ 0. At nadir the surface
   * regime's heading has nowhere else to go and surfaces here as image roll
   * (spec 2 §12-R1), so the disengage bake needs this field — nothing sets it
   * before that fold lands.
   */
  roll?: number;
  /**
   * [yaw, pitch] radians turning the VIEW about the eye after the orbit terms
   * place it; absent ⇒ [0, 0]. The eye never reads it, so the orbit terms stay
   * centre-looking; it is view-local, so a frame re-encode carries it and a
   * conversion into a body-fixed or site arm drops it.
   */
  lookOffset?: Vec2;
};
