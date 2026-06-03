/**
 * cameraSlice — default orbit pose + the viewProj-replacing reducer.
 *
 * The default yaw/pitch/distance frame the volume at a pleasant three-quarter
 * angle with idle auto-rotate on. `viewProj` starts as identity (a placeholder
 * the engine overwrites on the first frame once it knows the aspect ratio).
 * `setCameraViewProj` swaps only that matrix, leaving the user-facing pose
 * fields untouched.
 */
import type { CameraSlice } from '../../../@types/state/slices/CameraSlice';
import type { Mat4 } from '../../../../../src/@types/math/Mat4';

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const defaultCameraSlice: CameraSlice = {
  yaw: 0.6,
  pitch: 0.35,
  distance: 1.7,
  autoRotate: true,
  viewProj: IDENTITY,
};

export function setCameraViewProj(prev: CameraSlice, viewProj: Mat4): CameraSlice {
  return { ...prev, viewProj };
}

// Orbit-control bounds, mirroring the spike: pitch can't flip past the poles,
// and distance is held to a range that keeps the cube framed (spike index.html
// clamped drag pitch to ±1.5 and wheel distance to [0.6, 7]).
const PITCH_LIMIT = 1.5;
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 7;

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
