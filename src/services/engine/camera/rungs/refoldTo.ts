/**
 * The one conversion in the system: climb `toParent` to the frame the two ends
 * share, then descend `fromParent`. Whichever end is DEEPER moves first, so a
 * site → its own host arm is one hop, never a round trip through Mpc (2 §10).
 */

import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import type { ParentOf } from '../../../../@types/camera/ParentOf';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import type { RungKind } from '../../../../@types/camera/RungKind';
import { CAMERA_RUNGS } from './cameraRungs';
import { climbRowFor } from './climbRowFor';
import { hostOrThrow } from './hostOrThrow';
import { isWorldArm } from './isWorldArm';
import { rungKindOf } from './rungKindOf';
import { sameFrame } from './sameFrame';

/** Rungs to the world arm, off the rows' own `parent` so a new rung needs no line. */
function rungDepth(kind: RungKind): number {
  return kind === 'absolute' ? 0 : rungDepth(CAMERA_RUNGS[kind].parent) + 1;
}

/** Every non-root parent names this frame's HOST body (§2.2), keyed by its kind. */
function parentFrameOf(frame: FrameOf[ClimbableKind], ctx: RungBasisCtx): PoseFrame {
  const parent = climbRowFor(frame).parent;
  return parent === 'absolute' ? 'absolute' : { [parent]: hostOrThrow(frame, ctx).id };
}

export function refoldTo(
  framed: FramedCameraPose,
  target: PoseFrame,
  ctx: RungBasisCtx,
): FramedCameraPose {
  if (sameFrame(framed.frame, target)) return framed;
  if (!isWorldArm(framed) && rungDepth(rungKindOf(framed.frame)) >= rungDepth(rungKindOf(target))) {
    return refoldTo(climbRowFor(framed.frame).toParent(framed, ctx), target, ctx);
  }
  // Only a target strictly deeper than the source reaches here, so it has a
  // parent to descend from — and the recursion lands that parent in exactly the
  // frame the row's `fromParent` declares. Both are the ladder's own narrowing
  // (§2.6.3), one rung up, and neither is a fact the values' types can carry.
  const child = target as FrameOf[ClimbableKind];
  const parent = refoldTo(framed, parentFrameOf(child, ctx), ctx);
  return climbRowFor(child).fromParent(parent as FramedPose<ParentOf[ClimbableKind]>, child, ctx);
}
