/**
 * cosmoLabelProjection — the COSMO label director's `Label2DDirectorConfig.project`.
 *
 * COSMO anchors are absolute world Mpc, so `viewFromSlab` subtracts the eye.
 * `vp` stays for the lift stage. Memoised per `ctx` (the `preparedByCtx`
 * pattern used elsewhere in `frame/passes/`) so the declutter, the draw and the
 * pick in one frame read one record.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ViewRig } from '../../../@types/engine/frame/ViewRig';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';
import { outputProjectionOf } from '../../../utils/labels/outputProjectionOf';
import { viewFromSlabOf } from '../../../utils/labels/viewFromSlabOf';

const cache = new WeakMap<FrameView, Label2DProjection>();

export function cosmoLabelProjection(ctx: FrameView, rig: ViewRig): Label2DProjection {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const output = outputProjectionOf(ctx, rig);
  const projection: Label2DProjection = {
    vp: ctx.vp,
    output,
    viewFromSlab: viewFromSlabOf(output.viewFromWorld, ctx.drawCamPos),
    // `ctx.vp`'s own near plane, which clipped these anchors before.
    nearClipMpc: ctx.cam.near,
  };
  cache.set(ctx, projection);
  return projection;
}
