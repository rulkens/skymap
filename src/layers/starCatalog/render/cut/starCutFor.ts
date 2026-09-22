import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { PreparedStarCut } from '../../../../@types/rendering/PreparedStarCut';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { readStarCut } from './readStarCut';

/**
 * The star cut a leaf/aggregate DRAW should read: a capture face owns its own
 * (no temporal state to share); every other view shares this frame's one cut
 * off `runtime.renderer`. The pick path bypasses this and calls `readStarCut`
 * directly — its ctx is never the one the frame cut was set from.
 */
export function starCutFor(
  runtime: StarCatalogRuntime,
  settings: StarCatalogSettings,
  ctx: FrameView,
): PreparedStarCut | null {
  if (ctx.viewKind === 'capture') return readStarCut(runtime, settings, ctx);
  return runtime.renderer.getFrameCut();
}
