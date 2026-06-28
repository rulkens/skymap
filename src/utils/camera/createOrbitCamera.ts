/**
 * createOrbitCamera — construct a ready-to-use orbit camera from its initial
 * spherical parameters.
 *
 * An orbit camera places the viewer on the surface of an imaginary sphere
 * centred on a *target* point, controlled by `yaw` (spin around +Y),
 * `pitch` (tilt above/below the equator), and `distance` (sphere radius).
 * Every frame those three numbers tell us exactly where the camera sits in
 * world space; `computeViewProj` then builds the view matrix so the camera
 * always faces the target.
 *
 * Coordinate conventions (see `updatePosition` for the full derivation):
 *   yaw = 0, pitch = 0  →  camera on +Z axis, looking toward origin
 *   yaw increases        →  camera rotates counter-clockwise around +Y
 *   pitch increases      →  camera tilts upward (toward +Y)
 *
 * Pure: free of browser or WebGPU dependencies so it can be tested in a
 * plain Node/Vitest environment.
 */

import type { OrbitCameraInit } from '../../@types/camera/OrbitCameraInit';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import { updatePosition } from './updatePosition';

/**
 * Create a new orbit camera from the given parameters.
 *
 * `position` is computed immediately so the camera is ready to use
 * without a separate call to `updatePosition`.
 *
 * @param init  All camera parameters. See `OrbitCameraInit` for details.
 * @returns A fully-initialised `OrbitCamera` whose `position` reflects
 *          the given yaw, pitch, and distance.
 */
export function createOrbitCamera(init: OrbitCameraInit): OrbitCamera {
  // Allocate a zero position tuple; updatePosition fills it before we return.
  const cam: OrbitCamera = { ...init, position: [0, 0, 0] };
  updatePosition(cam);
  return cam;
}
