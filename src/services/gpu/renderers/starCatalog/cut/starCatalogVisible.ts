import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import { starCrossfadeOpacity } from '../../../../../utils/star/starCrossfadeOpacity';
import { SOURCE_REGISTRY } from '../../../../../data/sources';
import { SCALE_UNITS } from '../../../../../data/scaleUnits';

/**
 * The shared visibility gate for all three star layers (leaf, aggregate,
 * upsample). Enabled if the renderer exists, the master toggle is on, and ANY
 * loaded catalog is toggled on and still inside its crossfade band. All three
 * layers delegate their `enabled` here so the aggregate producer and its
 * upsample consumer never disagree — the same shared-projection discipline the
 * volume liveness gate uses.
 */
export function starCatalogVisible(state: PassState, ctx: ReadyFrameContext): boolean {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return false;
  if (!state.settings.starCatalogs.enabled) return false;

  const camDistPc =
    Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * SCALE_UNITS.MPC_TO_PC;

  for (const { source } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    // Only a SURVEY catalog can be in `loadedCatalogs` (a seeded one ships no
    // bin), so the `binBaseName` half of the guard is a narrowing device rather
    // than a live filter — it buys the crossfade band this layer draws by.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;
    if (starCrossfadeOpacity(entry.crossfadePc, camDistPc) > 0) return true;
  }
  return false;
}
