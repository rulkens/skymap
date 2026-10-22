import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PreparedBodySurfaceFrame } from '../../../@types/engine/frame/PreparedBodySurfaceFrame';
import type { SlabHostId } from '../../../@types/engine/frame/SlabHostId';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import { computeBodySurfaceFrame } from './computeBodySurfaceFrame';

const preparedByCtx = new WeakMap<FrameView, Map<SlabHostId, PreparedBodySurfaceFrame | null>>();

/**
 * One body-slab-row derivation, shared by the drawing passes' `draw` and
 * `drawPick`. Memoised per `(ctx, bodyId)`, so whichever call
 * site reaches it first in a frame does the work and the rest read the cache —
 * keyed on `bodyId`, not just `ctx`, because a single ctx serves every
 * body-slab row and a `ctx`-only memo would return Earth's frame for any other
 * body sharing the same frame.
 */
export function prepareBodySurfaceFrame(
  state: PassState,
  ctx: FrameView,
  view: SlabView,
): PreparedBodySurfaceFrame | null {
  if (view.slab.frame.kind !== 'body-m') return null;
  const bodyId = view.slab.frame.hostId;

  let byBody = preparedByCtx.get(ctx);
  if (byBody === undefined) {
    byBody = new Map();
    preparedByCtx.set(ctx, byBody);
  }
  if (byBody.has(bodyId)) return byBody.get(bodyId)!;

  const result = computeBodySurfaceFrame(state, ctx, view, bodyId);
  byBody.set(bodyId, result);
  return result;
}
