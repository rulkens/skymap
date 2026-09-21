import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { computeStarCut } from './computeStarCut';

/**
 * The WRITE half of the star cut: ONE walk over the union of the rig's view
 * frusta, about `views[0]`'s eye, advancing every catalog's per-node LOD fade
 * ramps (`starFadeState`) by one frame step. `runFrame` calls it once per real
 * frame and hands the result to `state.gpu.starCatalogRenderer.setFrameCut`
 * (mirrors `SurfaceTileSubsystem.setLastCut`), which is what makes "advance
 * runs once" hold — no per-ctx bookkeeping here. Its result carries the
 * frame's `anyNodeFading` keep-ticking vote, which only this path sets.
 * `views` must be non-empty — `views[0]` is the walk's origin.
 */
export function advanceStarCut(
  state: PassState,
  views: readonly FrameView[],
): PreparedStarCut | null {
  return computeStarCut(state, views, true);
}
