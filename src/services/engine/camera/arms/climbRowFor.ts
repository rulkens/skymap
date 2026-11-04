/** `rowFor` for a frame whose arm has a parent; the second and last `as` of the table (invariant §2.6.3). */
import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import { CAMERA_ARMS } from './cameraArms';
import { cameraArmKindOf } from './cameraArmKindOf';

export function climbRowFor<K extends ClimbableKind>(frame: FrameOf[K]): ClimbRow<K> {
  return CAMERA_ARMS[cameraArmKindOf(frame)] as ClimbRow<K>;
}
