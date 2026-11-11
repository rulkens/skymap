import type { CameraState } from '../../@types/camera/orbitCamera/CameraState';

/** True while a live clip drives the camera: its driver holds the pose and input steps are swallowed. */
export function clipOwnsCamera(camera: CameraState): boolean {
  return camera.clip !== null;
}
