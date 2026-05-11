/**
 * OrbitCameraInit — all parameters needed to construct an orbit camera.
 * Separating init from live state lets createOrbitCamera accept a plain object
 * literal and derive the rest (e.g. position) from it.
 */

/**
 * All parameters needed to construct an orbit camera.
 *
 * Separating init from state lets us pass a plain object literal to
 * `createOrbitCamera` and derive the rest (e.g. `position`) from it.
 */
import type { Vec3 } from './Vec';

export type OrbitCameraInit = {
  /** World-space point the camera orbits around and looks at. */
  target: Vec3;

  /**
   * Radius of the orbit sphere — distance between camera and target.
   * Must be > 0; should stay > `near` to avoid clipping the target.
   */
  distance: number;

  /**
   * Horizontal rotation angle in radians around the world +Y axis.
   *
   * Convention: yaw=0 places the camera on the +Z side of the target.
   * Positive yaw rotates counter-clockwise when viewed from above.
   */
  yaw: number;

  /**
   * Vertical tilt angle in radians above or below the horizontal plane.
   *
   * pitch=0 → camera is level with the target.
   * pitch > 0 → camera tilts upward (toward +Y pole).
   * pitch < 0 → camera tilts downward (toward −Y pole).
   *
   * ⚠ Singularity: at pitch = ±π/2 the camera sits exactly on the +Y or
   * −Y pole. At that point the "forward" direction and the "up" vector
   * `[0, 1, 0]` are collinear, and `lookAt` degenerates (produces NaN
   * or a wildly wrong matrix). The controls module (Task 8) *must* clamp
   * pitch to a range like ±(π/2 − ε) to avoid this.
   */
  pitch: number;

  /**
   * Camera-roll angle in radians around the view direction (the line
   * from `target` to `position`).  Rotates the up-vector that
   * `mat4.lookAt` uses to orient the image plane.
   *
   * roll = 0 → world +Y stays "up" on screen (default; matches every
   *           pre-roll rendering the project produced).
   * roll > 0 → image rotates counter-clockwise (the world tilts CW).
   *
   * Why expose roll on an orbit camera at all?  In a cosmological
   * scene there is no preferred up direction, so allowing the user
   * to roll is physically meaningful and not just a cosmetic.
   * SpaceMouse's `ry` (tilt-left-right) maps to this naturally;
   * before this field existed `ry` was ignored entirely.
   *
   * Optional with a default of 0 to keep every existing call site
   * (synthetic clouds, focus tween, controls) working unchanged.
   */
  roll?: number;

  /**
   * Vertical field of view in **radians**.
   *
   * π/4 (45°) is a natural-looking default. Wider values (large fovYRad)
   * create a fisheye look; narrower simulate a telephoto lens.
   */
  fovYRad: number;

  /**
   * Viewport width / height ratio. Must be updated whenever the canvas
   * is resized, otherwise the projection will stretch or squash the scene.
   */
  aspect: number;

  /**
   * Distance from the camera to the near clip plane.
   *
   * Fragments closer than `near` are discarded. Keep this as large as
   * your scene allows — the precision of the depth buffer is distributed
   * logarithmically between `near` and `far`, so a very small `near`
   * (e.g. 0.001) wastes most of the depth-buffer precision in empty space
   * close to the viewer, leading to z-fighting on distant geometry.
   */
  near: number;

  /**
   * Distance from the camera to the far clip plane.
   *
   * Fragments beyond `far` are discarded. Keep this as small as your
   * scene allows (same reasoning as `near`).
   */
  far: number;
};
