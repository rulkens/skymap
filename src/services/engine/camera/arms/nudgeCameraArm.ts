/** One frame's pixel-free motion through the arm that owns `framed`'s frame — `nudge` as the drain's `stepRow` reads `step`. */

import type { ArmDelta } from '../@types/ArmDelta';
import type { FramedPose } from '../../../../@types/camera/pose/FramedPose';
import type { CameraArmCtx } from '../../../../@types/camera/arms/CameraArmCtx';
import type { CameraArmKind } from '../../../../@types/camera/arms/CameraArmKind';
import type { TiltMemory } from '../../../../@types/camera/orientation/TiltMemory';
import { rowFor } from './rowFor';

export function nudgeCameraArm<K extends CameraArmKind>(
  framed: FramedPose<K>,
  tilt: TiltMemory,
  delta: ArmDelta,
  ctx: CameraArmCtx,
): { readonly pose: FramedPose<K>; readonly tilt: TiltMemory; readonly fovYRad?: number } {
  const nudged = rowFor<K>(framed.frame).nudge(tilt, framed, delta, ctx);
  const pose = { frame: framed.frame, pose: nudged.pose } as FramedPose<K>;
  return { pose, tilt: nudged.tilt, fovYRad: nudged.fovYRad };
}
