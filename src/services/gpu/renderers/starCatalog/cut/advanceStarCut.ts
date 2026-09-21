import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';
import { starCutOncePerCtx } from './starCutOncePerCtx';

/**
 * The WRITE half of the star cut: ONE walk over the union of the rig's view
 * frusta, about `views[0]`'s eye, advancing every catalog's per-node LOD fade
 * ramps (`starFadeState`) by one frame step — then registered under every
 * view, so each draws that same cut. `runFrame` calls it once per real frame,
 * BEFORE any layer calls `readStarCut` — that ordering plus the shared
 * `starCutOncePerCtx` is what makes "advance runs once" hold. Its result
 * carries the frame's `anyNodeFading` keep-ticking vote, which only this path
 * sets. `views` must be non-empty — `views[0]` is the walk's origin.
 */
export function advanceStarCut(
  state: PassState,
  views: readonly FrameView[],
): PreparedStarCut | null {
  return starCutOncePerCtx(views, () => computeStarCut(state, views[0]!, views, true));
}
