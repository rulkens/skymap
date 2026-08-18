/**
 * bloomSrcTexelSize — the ONE derivation of a bloom fold's source texel size,
 * shared by the downsample and upsample passes of the pyramid.
 *
 * Tap offsets must be measured in the SOURCE level's texels: `1 / source-
 * pixel-size` per axis, read off the size the source texture ACTUALLY has
 * (`sizeOf`) rather than recomputed as `scale / viewportPx` — the two differ
 * by the floor's remainder whenever the viewport isn't divisible by the
 * divisor, and the allocated size is the one the taps land in.
 */

import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { Vec2 } from '../../../../@types/math/Vec2';

export function bloomSrcTexelSize(ctx: ReadyFrameContext, srcId: string): Vec2 {
  const { width, height } = ctx.renderTargets.sizeOf(srcId);
  return [1 / width, 1 / height];
}
