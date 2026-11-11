import type { CameraState } from '../../@types/camera/orbitCamera/CameraState';

/**
 * True while a live clip drives the camera: its driver holds the pose and input steps are swallowed.
 * A paused clip in free look yields it, so a drag moves the camera while the scene stays at t.
 */
export function clipOwnsCamera(camera: CameraState): boolean {
  const transport = camera.clip?.transport;
  return camera.clip !== null && !(transport?.kind === 'paused' && transport.camera === 'free');
}
