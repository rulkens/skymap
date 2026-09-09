/**
 * All parameters needed to construct an orbit camera. Separating init from
 * live state lets `createOrbitCamera` take a plain object literal and derive
 * the rest (e.g. `position`) from it.
 */
import type { Vec3 } from './math/Vec3';
import type { Mat3 } from '../math/Mat3';

export type OrbitCameraInit = {
  /** World-space point the camera orbits around and looks at. */
  target: Vec3;

  /** Radius of the orbit sphere. Must be > 0, and > `near` or the target clips. */
  distance: number;

  /**
   * Horizontal rotation, radians: yaw=0 places the camera on the +Z side of
   * the target, positive yaw turns counter-clockwise seen from above.
   */
  yaw: number;

  /**
   * Vertical tilt off the horizontal plane, radians; positive tilts toward the
   * +Y pole. ⚠ At ±π/2 forward and the `[0, 1, 0]` up are collinear and
   * `lookAt` degenerates to NaN — the controls module clamps to ±(π/2 − ε).
   */
  pitch: number;

  /**
   * Camera roll about the view direction, radians. 0 keeps world +Y up on
   * screen; positive rotates the image counter-clockwise. Optional, default 0.
   */
  roll?: number;

  /**
   * Frame-local → world basis the (yaw, pitch) DECODE runs through:
   * `dir_world = poseBasis · dir_local`, frame-local zenith is local +Y.
   * Split from `upBasis` because they answer different questions: this one is
   * "which pole does yaw/pitch orbit around" — the committed frame, which jumps
   * once at a switch and never mid-slerp. A pose baked mid-roll off a transient
   * `upBasis` would decode wrong the instant the roll finished, so
   * `updatePosition` must stay pinned here. Absent ⇒ identity.
   */
  poseBasis?: Mat3;

  /**
   * Frame-local → world basis screen-up is derived from: `frameUp(upBasis)`
   * feeds `imagePlaneBasis` and every draw-time reader, so this one is free to
   * be the transient mid-slerp basis during an orientation-frame switch — see
   * `poseBasis` for why the decode cannot share that transience. Absent ⇒
   * identity.
   */
  upBasis?: Mat3;

  /** Vertical field of view, **radians**. */
  fovYRad: number;

  /** Viewport width / height; must be re-set on every canvas resize. */
  aspect: number;

  /**
   * Near clip distance. Keep it as large as the scene allows: depth-buffer
   * precision is distributed logarithmically between `near` and `far`, so a
   * very small `near` spends most of it on empty space and z-fights distant
   * geometry.
   */
  near: number;

  /** Far clip distance. Keep it as small as the scene allows (same reasoning). */
  far: number;
};
