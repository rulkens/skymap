/** The one reader of `PoseFrame`'s spelling: the bare string names the world arm;
 *  every other tag is `{ [kind]: value }`, and the value is that arm's identity. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { CameraArmKind } from '../../../../@types/camera/CameraArmKind';

export function cameraArmKindOf(frame: PoseFrame): CameraArmKind {
  if (frame === 'absolute') return 'absolute';
  // The key IS the kind, a fact the union type cannot state.
  return Object.keys(frame)[0] as CameraArmKind;
}
