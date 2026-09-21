import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import { starSourceDrawOpacity } from '../../../../../utils/star/starSourceDrawOpacity';
import { SOURCE_REGISTRY } from '../../../../../data/sources';
import { SCALE_UNITS } from '../../../../../data/scaleUnits';

/**
 * Shared visibility gate for all three star layers (leaf, aggregate,
 * upsample): the renderer exists, the master toggle is on, and ANY loaded
 * catalog is on and inside its crossfade band. All three delegate their
 * `enabled` here so the aggregate producer and its upsample consumer never
 * disagree.
 */
export function starCatalogVisible(state: PassState, ctx: FrameView): boolean {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return false;
  if (!state.settings.starCatalogs.enabled) return false;

  const camDistPc =
    Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * SCALE_UNITS.MPC_TO_PC;

  for (const { source } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    if (starSourceDrawOpacity(entry, state.settings.starCatalogs, camDistPc) > 0) return true;
  }
  return false;
}
