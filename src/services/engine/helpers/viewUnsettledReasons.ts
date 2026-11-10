/**
 * viewUnsettledReasons — what `settled()` (every screenshot tool) waits on: the
 * scene's reasons plus a camera still moving. A shot during the focus flight shows
 * where it started (Earth, at boot), and the assets a destination demands are only
 * asked for once the camera nears it.
 */
import { sceneUnsettledReasons } from './sceneUnsettledReasons';
import type { CameraState } from '../../../@types/camera/orbitCamera/CameraState';

export function viewUnsettledReasons(
  state: Parameters<typeof sceneUnsettledReasons>[0],
  camera: Pick<CameraState, 'tween' | 'frameTween'>,
): string[] {
  return [
    ...(camera.tween === null ? [] : ['camera flight']),
    ...(camera.frameTween === null ? [] : ['frame turn']),
    ...sceneUnsettledReasons(state),
  ];
}
