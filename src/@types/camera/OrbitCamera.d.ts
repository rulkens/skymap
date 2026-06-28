/**
 * OrbitCamera — a live orbit camera extending OrbitCameraInit with a derived
 * world-space position. The position is stored explicitly so controls and
 * raycasting code can read it cheaply without re-deriving it each frame.
 */

import type { Vec3 } from '../math/Vec3';
import type { OrbitCameraInit } from './OrbitCameraInit';

/**
 * A live orbit camera: all init parameters plus the derived `position`.
 *
 * `position` is stored as a field rather than recomputed inside
 * `computeViewProj` so that:
 *
 *   1. The controls module can read the camera position cheaply for
 *      raycasting, frustum culling, and UI feedback without re-deriving it.
 *   2. `updatePosition` is explicit — callers know exactly when the geometry
 *      changes, which helps reason about update order.
 */
export type OrbitCamera = OrbitCameraInit & {
  /**
   * World-space camera position, derived from target + distance + yaw + pitch.
   * Do NOT write this directly — call `updatePosition(cam)` instead.
   */
  position: Vec3;
};
