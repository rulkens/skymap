import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * This frame's star cut, READ-ONLY — it never advances a fade ramp, so the
 * pick path's fresh post-frame ctx can recompute without perturbing them.
 * `advanceStarFades` is the writer; both share `starCutOncePerCtx`.
 */
export function prepareStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  return starCutOncePerCtx(ctx, () => computeStarCut(state, ctx, false));
}
