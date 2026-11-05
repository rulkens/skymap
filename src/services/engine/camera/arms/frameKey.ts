/** The frame's debug/log grammar; the kind prefix exists so a body id 'absolute' can't collide with the world arm. */
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import { rowFor } from './rowFor';
import { cameraArmKindOf } from './cameraArmKindOf';

export function frameKey(frame: PoseFrame): string {
  const kind = cameraArmKindOf(frame);
  return frame === 'absolute' ? kind : `${kind}:${rowFor(frame).identity(frame)}`;
}
