/**
 * `refoldTo`'s `'absolute'` specialisation. The world arm returns its own pose
 * BY REFERENCE — that identity is what keeps the per-frame fold free (spec §7).
 */

import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';
import type { FramedCameraPose } from '../../../../@types/camera/pose/FramedCameraPose';
import type { CameraArmBasisCtx } from '../../../../@types/camera/arms/CameraArmBasisCtx';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './world/isWorldArm';

export function foldToWorld(framed: FramedCameraPose, ctx: CameraArmBasisCtx): CameraPose {
  if (isWorldArm(framed)) return framed.pose;
  return foldToWorld(climbRowFor(framed.frame).toParent(framed, ctx), ctx);
}
