import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';

/**
 * The memoised star cut for a view that owns its own — a capture face or the
 * pick path (`starCutFor` picks between this and the frame-wide cut).
 * `computeStarCut` is pure (`advanceStarFades` is the ramps' one writer), so a
 * fresh post-frame ctx recomputes without perturbing them. Memoised per ctx
 * object ONLY (never
 * fanned out to other views, unlike the frame-wide cut): a capture face's
 * `near0Passes` draw both the leaf and aggregate streams against the SAME
 * ctx in one render step, so the second call reuses the first's walk rather
 * than repeating it; `deriveView` mints a fresh ctx per view per frame, so
 * the WeakMap entry is GC'd with it and never sees a stale frame.
 */
const cutByCtx = new WeakMap<FrameView, PreparedStarCut | null>();

export function readStarCut(state: PassState, ctx: FrameView): PreparedStarCut | null {
  if (cutByCtx.has(ctx)) return cutByCtx.get(ctx)!;
  const result = computeStarCut(state, [ctx]);
  cutByCtx.set(ctx, result);
  return result;
}
