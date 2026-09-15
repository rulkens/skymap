/**
 * The frame one rung up: the world arm above a body, the host's body arm above
 * a site. Every non-root parent names this frame's HOST body (§2.2 — a site
 * hangs off its planet's arm), and the kind IS the key the tag spells it under.
 */

import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import { climbRowFor } from './climbRowFor';
import { hostOrThrow } from './hostOrThrow';

export function parentFrameOf(frame: FrameOf[ClimbableKind], ctx: RungBasisCtx): PoseFrame {
  const parent = climbRowFor(frame).parent;
  return parent === 'absolute' ? 'absolute' : { [parent]: hostOrThrow(frame, ctx).id };
}
