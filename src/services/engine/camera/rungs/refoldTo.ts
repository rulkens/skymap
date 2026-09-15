/**
 * The one conversion in the system: climb `toParent` to the rung the two frames
 * share, then descend `fromParent` to the target. Whichever end is deeper moves
 * first, so a site → its own host arm is ONE `toParent` and never a round trip
 * through heliocentric Mpc (spec 2 §10's seam); a pose already in the target
 * frame is answered by reference.
 */

import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import type { ParentOf } from '../../../../@types/camera/ParentOf';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './isWorldArm';
import { parentFrameOf } from './parentFrameOf';
import { rungDepth } from './rungDepth';
import { rungKindOf } from './rungKindOf';
import { sameFrame } from './sameFrame';

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
