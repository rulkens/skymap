/**
 * `refoldTo`'s `'absolute'` specialisation. The world arm returns its own pose
 * BY REFERENCE — that identity is what keeps the per-frame fold free (spec §7)
 * — and a deeper rung climbs every step, since a site sits two rungs down.
 */

import type { CameraPose } from '../../../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './isWorldArm';

export function foldToWorld(framed: FramedCameraPose, ctx: RungBasisCtx): CameraPose {
  if (isWorldArm(framed)) return framed.pose;
  return foldToWorld(climbRowFor(framed.frame).toParent(framed, ctx), ctx);
}
