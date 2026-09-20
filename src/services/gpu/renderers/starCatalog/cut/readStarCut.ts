import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * The READ half of the star cut: it never advances a fade ramp, so the pick
 * path's fresh post-frame ctx can recompute the cut without perturbing them.
 * `advanceStarCut` is the write half; both share `starCutOncePerCtx`.
 */
export function readStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  return starCutOncePerCtx(ctx, () => computeStarCut(state, ctx, false));
}
