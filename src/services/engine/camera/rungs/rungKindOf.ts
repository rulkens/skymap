/** The one reader of `PoseFrame`'s spelling: the bare string names the world
 *  arm, and every other rung carries its id under the key that IS its kind. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';

export function rungKindOf(frame: PoseFrame): RungKind {
  if (frame === 'absolute') return 'absolute';
  return 'body' in frame ? 'body' : 'site';
}
