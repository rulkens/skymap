/**
 * cosmoLabelProjection — the COSMO label director's `Label2DDirectorConfig.project`.
 *
 * `ctx.vp` is already an f32 `Mat4` for this slab (no NEAR0 split), so `vp` and
 * `vpF32` are the same reference — a future f64 slab's projection function narrows
 * instead of aliasing. Memoised per `ctx` (the `preparedByCtx` pattern used
 * elsewhere in `frame/passes/`) so a second caller in the same frame — declutter,
 * and later the lift stage — reads the cached record rather than recomputing.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';

const cache = new WeakMap<ReadyFrameContext, Label2DProjection>();

export function cosmoLabelProjection(ctx: ReadyFrameContext): Label2DProjection {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const projection: Label2DProjection = {
    vp: ctx.vp,
    vpF32: ctx.vp,
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
  cache.set(ctx, projection);
  return projection;
}
