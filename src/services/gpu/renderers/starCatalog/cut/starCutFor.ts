import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { readStarCut } from './readStarCut';

/**
 * The star cut a leaf/aggregate DRAW should read: a capture face owns its own
 * (no temporal state to share); every other view shares this frame's one cut
 * off `state.gpu.starCatalogRenderer`. The pick path bypasses this and calls
 * `readStarCut` directly — its ctx is never the one the frame cut was set from.
 */
export function starCutFor(state: PassState, ctx: FrameView): PreparedStarCut | null {
  if (ctx.viewKind === 'capture') return readStarCut(state, ctx);
  return state.gpu.starCatalogRenderer?.getFrameCut() ?? null;
}
