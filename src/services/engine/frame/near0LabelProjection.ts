/**
 * near0LabelProjection — the NEAR0 label director's `Label2DDirectorConfig.project`.
 *
 * Rebases the slab's f64 `vp` about the camera in f64 (`rebaseViewProj`) — the
 * same precision fix `foregroundLabelsLayer.ts` applies today, load-bearing at
 * solar-system zoom where the raw vp's view translation and a near anchor's
 * coordinate agree to only ~4 f32 digits (see `rebaseViewProj`'s module
 * header). `vp` stays f64 for the lift stage's inverse-projection math;
 * `vpF32` is narrowed once for the renderer upload. Memoised per `ctx`, like
 * its COSMO sibling.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { NEAR0 } from './slabs';

const cache = new WeakMap<ReadyFrameContext, Label2DProjection>();

export function near0LabelProjection(ctx: ReadyFrameContext): Label2DProjection {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const slab = ctx.slabs[NEAR0];
  if (!slab) throw new Error(`near0LabelProjection: no slab at index ${NEAR0}`);
  const vp = rebaseViewProj(slab.vp, ctx.drawCamPos);
  const projection: Label2DProjection = {
    vp,
    vpF32: narrowMat4(vp),
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
  cache.set(ctx, projection);
  return projection;
}
