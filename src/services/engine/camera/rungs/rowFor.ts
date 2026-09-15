/** The table's one narrowing: the key came from the frame itself, which the index cannot prove —
 *  invariant §2.6.3, one `as` here and one in `climbRowFor`. */

import type { FrameOf } from '../../../../@types/camera/FrameOf';
import type { RungKind } from '../../../../@types/camera/RungKind';
import type { RungRow } from '../../../../@types/camera/RungRow';
import { CAMERA_RUNGS } from './cameraRungs';
import { rungKindOf } from './rungKindOf';

export function rowFor<K extends RungKind>(frame: FrameOf[K]): RungRow<K> {
  return CAMERA_RUNGS[rungKindOf(frame)] as RungRow<K>;
}
