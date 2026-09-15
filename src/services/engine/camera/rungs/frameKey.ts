/** The frame's debug/log grammar; the `body:` prefix exists so a body id 'absolute' can't collide with the world arm. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';

export function frameKey(frame: PoseFrame): string {
  return frame === 'absolute' ? 'absolute' : `body:${frame.body}`;
}
