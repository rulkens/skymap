/** The frame's debug/log grammar; the kind prefix exists so a body id 'absolute' can't collide with the world arm. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import { rowFor } from './rowFor';
import { rungKindOf } from './rungKindOf';

export function frameKey(frame: PoseFrame): string {
  const kind = rungKindOf(frame);
  return frame === 'absolute' ? kind : `${kind}:${rowFor(frame).identity(frame)}`;
}
