/** Frame equality by what it names, not by object identity: two distinct `{ body }` objects can name one body. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import { frameKey } from './frameKey';

export function sameFrame(a: PoseFrame, b: PoseFrame): boolean {
  return frameKey(a) === frameKey(b);
}
