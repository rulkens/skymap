/** The table's one narrowing: the key came from the frame itself, which the index cannot prove —
 *  invariant §2.6.3, one `as` here and one in `climbRowFor`. */

import type { FrameOf } from '../../../../@types/camera/arms/FrameOf';
import type { CameraArmKind } from '../../../../@types/camera/arms/CameraArmKind';
import type { CameraArmRow } from './@types/CameraArmRow';
import { CAMERA_ARMS } from './cameraArms';
import { cameraArmKindOf } from './cameraArmKindOf';

export function rowFor<K extends CameraArmKind>(frame: FrameOf[K]): CameraArmRow<K> {
  return CAMERA_ARMS[cameraArmKindOf(frame)] as CameraArmRow<K>;
}
