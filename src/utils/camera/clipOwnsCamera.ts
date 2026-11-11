import type { CameraState } from '../../@types/camera/orbitCamera/CameraState';

/** True while a live clip drives the camera; a paused clip in free look yields it to input. */
export function clipOwnsCamera(camera: CameraState): boolean {
  const transport = camera.clip?.transport;
  return camera.clip !== null && !(transport?.kind === 'paused' && transport.camera === 'free');
}
