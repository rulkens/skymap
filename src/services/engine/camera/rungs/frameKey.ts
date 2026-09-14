/**
 * The frame's debug/log grammar (`CameraStateSection.tsx`'s `frameLabel`,
 * `logCameraState` from Task 2 on): the world arm bare, a body arm prefixed
 * so a body id that collides with 'absolute' cannot alias it.
 */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';

export function frameKey(frame: PoseFrame): string {
  return frame === 'absolute' ? 'absolute' : `body:${frame.body}`;
}
