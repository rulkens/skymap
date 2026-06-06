/**
 * cameraSlice — default orbit pose + the viewProj-replacing reducer.
 *
 * Distances are in Mpc (world units): the canonical flow renderer places the
 * cube at its physical extent via `buildCubeModelMatrix` — the flow field is a
 * 1000 Mpc box centred on the observer, spanning ±500 Mpc (corner ~866 Mpc out).
 * The default yaw/pitch/distance frame that whole box at a three-quarter angle
 * with idle auto-rotate on. `viewProj` starts as identity (a placeholder the
 * harness overwrites on the first frame once it knows the aspect ratio).
 * `setCameraViewProj` swaps only that matrix, leaving the pose fields untouched.
 */
import type { CameraSlice } from '../../../@types/state/slices/CameraSlice';
import type { Mat4 } from '../../../../../src/@types/math/Mat4';

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const defaultCameraSlice: CameraSlice = {
  yaw: 0.6,
  pitch: 0.35,
  // ~1500 Mpc frames the ±500 Mpc box with headroom at fov 1.0 rad.
  distance: 1500,
  autoRotate: true,
  viewProj: IDENTITY,
};

export function setCameraViewProj(prev: CameraSlice, viewProj: Mat4): CameraSlice {
  return { ...prev, viewProj };
}

// Orbit-control bounds (Mpc world units): pitch can't flip past the poles, and
// wheel distance is held to a range that keeps the ±500 Mpc cube framed — from
// well inside it out to a wide establishing shot.
const PITCH_LIMIT = 1.5;
const MIN_DISTANCE = 300;
const MAX_DISTANCE = 4000;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Set the orbit yaw/pitch (drag), clamping pitch away from the poles. */
export function setCameraYawPitch(prev: CameraSlice, yaw: number, pitch: number): CameraSlice {
  return { ...prev, yaw, pitch: clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT) };
}

/** Set the orbit distance (wheel/zoom), clamped to the framed range. */
export function setCameraDistance(prev: CameraSlice, distance: number): CameraSlice {
  return { ...prev, distance: clamp(distance, MIN_DISTANCE, MAX_DISTANCE) };
}

/** Toggle idle auto-rotation. */
export function setAutoRotate(prev: CameraSlice, autoRotate: boolean): CameraSlice {
  return { ...prev, autoRotate };
}
