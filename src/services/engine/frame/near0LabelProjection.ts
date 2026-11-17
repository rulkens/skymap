/**
 * near0LabelProjection — the NEAR0 label director's `Label2DDirectorConfig.project`.
 *
 * NEAR0 anchors are camera-relative Mpc, so `viewFromSlab` is the rotation
 * alone. `vp` is the slab's f64 vp rebased about the camera (`rebaseViewProj`)
 * for the lift stage's inverse-projection math, load-bearing at solar-system
 * zoom (see `rebaseViewProj`'s header). Memoised per `ctx`, like its COSMO sibling.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ViewRig } from '../../../@types/engine/frame/ViewRig';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';
import { rebaseViewProj } from '../../../utils/camera/projection/rebaseViewProj';
import { outputProjectionOf } from '../../../utils/labels/outputProjectionOf';
import { viewFromSlabOf } from '../../../utils/labels/viewFromSlabOf';
import { NEAR0 } from './slabs';

const cache = new WeakMap<FrameView, Label2DProjection>();

export function near0LabelProjection(ctx: FrameView, rig: ViewRig): Label2DProjection {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const slab = ctx.slabs[NEAR0];
  if (!slab) throw new Error(`near0LabelProjection: no slab at index ${NEAR0}`);
  const output = outputProjectionOf(ctx, rig);
  const projection: Label2DProjection = {
    vp: rebaseViewProj(slab.vp, ctx.drawCamPos),
    output,
    viewFromSlab: viewFromSlabOf(output.viewFromWorld, [0, 0, 0]),
    // NEAR0's reversed-Z clip-z clamp kept every anchor ahead of the eye.
    nearClipMpc: 0,
  };
  cache.set(ctx, projection);
  return projection;
}
