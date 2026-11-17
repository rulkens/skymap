/**
 * near0LabelProjection — the NEAR0 label director's `Label2DDirectorConfig.project`.
 *
 * NEAR0 anchors are camera-relative Mpc, so `viewFromSlab` is the rotation
 * alone. Memoised per `ctx`, like its COSMO sibling.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ViewRig } from '../../../@types/engine/frame/ViewRig';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';
import { outputProjectionOf } from '../../../utils/labels/outputProjectionOf';
import { viewFromSlabOf } from '../../../utils/labels/viewFromSlabOf';

const cache = new WeakMap<FrameView, Label2DProjection>();

export function near0LabelProjection(ctx: FrameView, rig: ViewRig): Label2DProjection {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const output = outputProjectionOf(ctx, rig);
  const projection: Label2DProjection = {
    output,
    viewFromSlab: viewFromSlabOf(output.viewFromWorld, [0, 0, 0]),
    // NEAR0's reversed-Z clip-z clamp kept every anchor ahead of the eye.
    nearClipMpc: 0,
  };
  cache.set(ctx, projection);
  return projection;
}
