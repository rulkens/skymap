/** The one reader of `PoseFrame`'s two-arm spelling: the bare string names the
 *  world arm, anything else carries exactly the key it derives from. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';

export function rungKindOf(frame: PoseFrame): RungKind {
  return frame === 'absolute' ? 'absolute' : 'body';
}
