import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';

// Per-frame memo keyed by `ctx` identity, so a repeat call for the same frame
// never re-walks or double-advances the fade ramps.
const preparedByCtx = new WeakMap<ReadyFrameContext, PreparedStarCut | null>();

/** Read-only: never advances a fade ramp. See `advanceStarFades`, the writer. */
export function prepareStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeStarCut(state, ctx, false);
  preparedByCtx.set(ctx, result);
  return result;
}

// `runFrame` calls this exactly once per real frame, BEFORE any layer calls
// `prepareStarCut` — that ordering plus the shared memo above is what makes
// "advance runs once" hold with no viewSlot/ctx-identity special case.
export function advanceStarFades(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeStarCut(state, ctx, true);
  preparedByCtx.set(ctx, result);
  return result;
}
