/**
 * The one conversion in the system: climb `toParent` to the frame the two ends
 * share, then descend `fromParent`. Whichever end is DEEPER moves first, so a
 * site → its own host arm is one hop, never a round trip through Mpc (2 §10).
 */

import type { ClimbableKind } from '../@types/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/arms/FrameOf';
import type { FramedCameraPose } from '../../../../@types/camera/pose/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/pose/FramedPose';
import type { ParentOf } from './@types/ParentOf';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import type { CameraArmBasisCtx } from '../../../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraArmKind } from '../../../../@types/camera/arms/CameraArmKind';
import { CAMERA_ARMS } from './cameraArms';
import { climbRowFor } from './climbRowFor';
import { hostOrThrow } from './hostOrThrow';
import { isWorldArm } from './world/isWorldArm';
import { cameraArmKindOf } from './cameraArmKindOf';
import { sameFrame } from './sameFrame';

/** Arms to the world arm, off the rows' own `parent` so a new arm needs no line. */
function rungDepth(kind: CameraArmKind): number {
  return kind === 'absolute' ? 0 : rungDepth(CAMERA_ARMS[kind].parent) + 1;
}

/** Every non-root parent names this frame's HOST body (§2.2), keyed by its kind. */
function parentFrameOf(frame: FrameOf[ClimbableKind], ctx: CameraArmBasisCtx): PoseFrame {
  const parent = climbRowFor(frame).parent;
  return parent === 'absolute' ? 'absolute' : { [parent]: hostOrThrow(frame, ctx).id };
}

export function refoldTo(
  framed: FramedCameraPose,
  target: PoseFrame,
  ctx: CameraArmBasisCtx,
): FramedCameraPose {
  if (sameFrame(framed.frame, target)) return framed;
  if (
    !isWorldArm(framed) &&
    rungDepth(cameraArmKindOf(framed.frame)) >= rungDepth(cameraArmKindOf(target))
  ) {
    return refoldTo(climbRowFor(framed.frame).toParent(framed, ctx), target, ctx);
  }
  // Only a target strictly deeper than the source reaches here, so it has a
  // parent to descend from — and the recursion lands that parent in exactly the
  // frame the row's `fromParent` declares. Both are the arm tree's own narrowing
  // (§2.6.3), one arm up, and neither is a fact the values' types can carry.
  const child = target as FrameOf[ClimbableKind];
  const parent = refoldTo(framed, parentFrameOf(child, ctx), ctx);
  return climbRowFor(child).fromParent(parent as FramedPose<ParentOf[ClimbableKind]>, child, ctx);
}
