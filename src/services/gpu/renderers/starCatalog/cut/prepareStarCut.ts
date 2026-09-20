import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';

/**
 * Per-frame memo, shared by `prepareStarCut` and `advanceStarFades`: whichever
 * runs first for a `ctx` object caches the result, so a repeat call for that
 * SAME ctx never re-walks. `deriveFrameContext` mints a fresh `ctx` each real
 * frame, so the previous entry is GC'd with it. `advanceStarFades` is the ONLY
 * writer of the per-catalog fade state; the memo is what stops a second call
 * for the same ctx from double-advancing the ramps.
 */
const preparedByCtx = new WeakMap<ReadyFrameContext, PreparedStarCut | null>();

/**
 * Walk every loaded catalog's octree and PARTITION the resulting cut into a
 * leaf stream and an aggregate stream, reading each node's CURRENT LOD-fade
 * opacity — pure over the fade state, it never advances a ramp (see
 * `advanceStarFades`, the one function that does). `null` when the star pass
 * is not live (no renderer, master off). Memoised on `ctx` (see
 * `preparedByCtx`): the frame's main-view `ctx` normally hits the entry
 * `advanceStarFades` already populated, so this only walks fresh for a
 * DIFFERENT ctx — a sky-cubemap capture face or the pick path's post-frame ctx.
 */
export function prepareStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeStarCut(state, ctx, false);
  preparedByCtx.set(ctx, result);
  return result;
}

/**
 * Advance every loaded catalog's per-node LOD fade by one frame step (see
 * `NODE_FADE_MS`) for the main view's `ctx`, and cache the resulting cut under
 * it. Called exactly once per real frame by runFrame, BEFORE any layer calls
 * `prepareStarCut` — that ordering plus the shared `preparedByCtx` memo is what
 * makes "advance runs once" hold without a viewSlot or ctx-identity special
 * case at the call sites. Returns the same shape as `prepareStarCut` (its
 * `anyNodeFading` is the frame's keep-ticking wake vote).
 */
export function advanceStarFades(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeStarCut(state, ctx, true);
  preparedByCtx.set(ctx, result);
  return result;
}
