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
import type { Vec3 } from './math/Vec3';
import type { Mat3 } from '../math/Mat3';

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
   *
   * Optional with a default of 0 to keep every existing call site
   * (synthetic clouds, focus tween, controls) working unchanged.
   */
  roll?: number;

  /**
   * Frame-local → world orientation basis (column-major 3×3) the (yaw, pitch)
   * DECODE runs through: `dir_world = poseBasis · dir_local`, where the
   * frame-local zenith (elevation +π/2) is local +Y. `updatePosition` and
   * `orbitAnglesLookingAlong` (its inverse) are the two consumers — both
   * compile-time / decode-time reads, never draw-time.
   *
   * `poseBasis` and `upBasis` (below) used to be one field (`frameBasis`).
   * They are split because they answer different questions: `poseBasis` is
   * "which pole does yaw/pitch orbit around" (the committed frame — jumps once
   * at a switch, never mid-slerp), `upBasis` is "which pole does screen-up
   * follow" (the live, possibly mid-slerp `B(t)`). A pose baked mid-roll off a
   * transient `upBasis` would decode wrong the instant the roll finished, so
   * `updatePosition` must stay pinned to the steady `poseBasis`.
   *
   * Optional: absent ⇒ identity, i.e. the pre-feature decode where local +Y is
   * world +Y. Every non-engine caller (synthetic clouds, focus tween, dev-tool
   * cameras) omits it and is byte-for-byte unchanged — mirrors `roll?`.
   *
   * Mutable (like `roll`, `yaw`, `pitch`) so per-frame assembly can stamp the
   * resolved bases; the gesture fold takes both bases as explicit parameters
   * instead of reading them off a stored camera.
   */
  poseBasis?: Mat3;

  /**
   * Frame-local → world orientation basis screen-up is derived from:
   * `frameUp(upBasis)` (the middle column) feeds `imagePlaneBasis`, which
   * `computeViewProj`, `cameraBillboardBasis`, `horizonShellRenderer`, `slabs`,
   * and `orbitControls`' pan drag all read. These are draw-time / per-frame
   * reads, so `upBasis` is free to be the transient mid-slerp basis during an
   * orientation-frame switch — see `poseBasis` above for why the decode can't
   * share that transience.
   *
   * Optional, same identity-absent convention as `poseBasis`.
   */
  upBasis?: Mat3;

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
