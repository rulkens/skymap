import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * The one writer of the per-node LOD fade ramps — `runFrame` calls it once per
 * real frame, BEFORE any layer calls `prepareStarCut`. That ordering plus the
 * shared `starCutOncePerCtx` is what makes "advance runs once" hold. Its
 * result carries the frame's `anyNodeFading` keep-ticking vote.
 */
export function advanceStarFades(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null {
  return starCutOncePerCtx(ctx, () => computeStarCut(state, ctx, true));
}
