import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * The WRITE half of the star cut: it advances every catalog's per-node LOD fade
 * ramps (`starFadeState`) by one frame step, then returns the cut. `runFrame`
 * calls it once per real frame, BEFORE any layer calls `readStarCut` — that
 * ordering plus the shared `starCutOncePerCtx` is what makes "advance runs
 * once" hold. Its result carries the frame's `anyNodeFading` keep-ticking vote,
 * which only this path sets.
 */
export function advanceStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  return starCutOncePerCtx(ctx, () => computeStarCut(state, ctx, true));
}
