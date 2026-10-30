/** One frame's pixel-free motion through the rung that owns `framed`'s frame — `nudge` as the drain's `stepRow` reads `step`. */

import type { ArmDelta } from '../../../../@types/camera/ArmDelta';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import type { RungCtx } from '../../../../@types/camera/RungCtx';
import type { RungKind } from '../../../../@types/camera/RungKind';
import type { TiltMemory } from '../../../../@types/camera/TiltMemory';
import { rowFor } from './rowFor';

export function nudgeRung<K extends RungKind>(
  framed: FramedPose<K>,
  tilt: TiltMemory,
  delta: ArmDelta,
  ctx: RungCtx,
): { readonly pose: FramedPose<K>; readonly tilt: TiltMemory } {
  const nudged = rowFor<K>(framed.frame).nudge(tilt, framed, delta, ctx);
  return { pose: { frame: framed.frame, pose: nudged.pose } as FramedPose<K>, tilt: nudged.tilt };
}
