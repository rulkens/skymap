/** `rowFor` for a frame whose rung has a parent; the second and last `as` of the table (invariant §2.6.3). */
import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import { CAMERA_RUNGS } from './cameraRungs';
import { rungKindOf } from './rungKindOf';

export function climbRowFor<K extends ClimbableKind>(frame: FrameOf[K]): ClimbRow<K> {
  return CAMERA_RUNGS[rungKindOf(frame)] as ClimbRow<K>;
}
