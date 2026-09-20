import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * The READ half of the star cut: it never advances a fade ramp, so the pick
 * path's fresh post-frame ctx can recompute the cut without perturbing them.
 * `advanceStarCut` is the write half; both share `starCutOncePerCtx`. A frame
 * view normally hits the cut that call already registered; a walk that lands
 * here (a capture face, the pick path) is this one ctx's own view alone.
 */
export function readStarCut(state: PassState, ctx: FrameView): PreparedStarCut | null {
  return starCutOncePerCtx([ctx], () => computeStarCut(state, ctx, [ctx], false));
}
