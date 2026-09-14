/**
 * The one conversion in the system: climb `toParent` to the rung the two
 * frames share, then descend `fromParent` to the target. With two rungs that
 * is at most one hop each way, and a pose already in the target frame is
 * answered by reference.
 */

import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './isWorldArm';
import { sameFrame } from './sameFrame';

export function refoldTo(
  framed: FramedCameraPose,
  target: PoseFrame,
  ctx: RungBasisCtx,
): FramedCameraPose {
  if (sameFrame(framed.frame, target)) return framed;
  const world = isWorldArm(framed) ? framed : climbRowFor(framed.frame).toParent(framed, ctx);
  if (target === 'absolute') return world;
  return climbRowFor(target).fromParent(world, target, ctx);
}
