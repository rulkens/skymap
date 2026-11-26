import type { CameraIntentState } from '../../@types/camera/orbitCamera/CameraIntentState';

/** True while a live clip drives the camera; a paused clip in free look yields it to input. */
export function clipOwnsCamera(camera: Pick<CameraIntentState, 'clip'>): boolean {
  const transport = camera.clip?.transport;
  return camera.clip !== null && !(transport?.kind === 'paused' && transport.camera === 'free');
}
