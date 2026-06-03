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
