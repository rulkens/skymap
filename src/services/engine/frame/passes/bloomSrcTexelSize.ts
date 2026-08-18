/**
 * bloomSrcTexelSize — the ONE derivation of a bloom fold's source texel size,
 * shared by the downsample and upsample passes of the pyramid.
 *
 * Both halves of the pyramid pass their source level's texel size to the shader
 * so the tap offsets are measured in the SOURCE level's texels: `1 / source-
 * pixel-size` per axis, read off the size the source texture ACTUALLY has
 * (`sizeOf`) rather than recomputed as `scale / viewportPx`. The two differ by
 * the floor's remainder whenever the viewport isn't divisible by the divisor,
 * and the allocated size is the one the taps land in.
 *
 * Duplicating this two-line formula across the two pass loops would be two
 * chances to drift the lookup; naming it once keeps the derivation
 * single-sourced.
 */

import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { Vec2 } from '../../../../@types/math/Vec2';

export function bloomSrcTexelSize(ctx: ReadyFrameContext, srcId: string): Vec2 {
  const { width, height } = ctx.renderTargets.sizeOf(srcId);
  return [1 / width, 1 / height];
}
