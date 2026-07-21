/**
 * bloomSrcTexelSize — the ONE derivation of a bloom fold's source texel size,
 * shared by the downsample and upsample passes of the pyramid.
 *
 * Both the descending (downsample) and ascending (upsample) halves of the
 * pyramid pass their source level's texel size to the shader so the tap offsets
 * are measured in the SOURCE level's texels. The value is `1 / source-pixel-size`
 * per axis — and the source level's pixel size is the full-res viewport divided
 * by that render-target row's `scale` divisor. So:
 *
 *   sourcePixels = viewportPx / scale   ⇒   texelSize = 1 / sourcePixels = scale / viewportPx
 *
 * `scale` is read LIVE off the source target's `RenderTargetSpec` row, never
 * hard-coded: the bloom rows declare `scale` 2/4/8/16/32 in `renderTargets.ts`,
 * and the derivation must track any retune of those divisors from that single
 * source of truth. `viewportPx` is the full-res draw size (the same for every
 * bloom level — the pyramid rows are all sub-scales of the one viewport), passed
 * directly by the caller (`runBloom`, the only consumer).
 *
 * Duplicating this two-line formula across the two pass loops would be two
 * chances to drift the divisor lookup; naming it once keeps the derivation
 * single-sourced.
 */

import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { Vec2 } from '../../../../@types/math/Vec2';

export function bloomSrcTexelSize(ctx: ReadyFrameContext, viewportPx: Vec2, srcId: string): Vec2 {
  const scale = ctx.renderTargets.specs.find((spec) => spec.id === srcId)!.scale;
  return [scale / viewportPx[0], scale / viewportPx[1]];
}
