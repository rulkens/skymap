import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { starSourcesInBand } from './starSourcesInBand';

/**
 * Shared visibility gate for all three star layers (leaf, aggregate,
 * upsample): ANY loaded catalog is on and inside its crossfade band. All
 * three delegate their `enabled` here so the aggregate producer and its
 * upsample consumer never disagree.
 */
export function starCatalogVisible(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  settings: StarCatalogSettings,
  ctx: FrameView,
): boolean {
  const camDistPc =
    Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * SCALE_UNITS.MPC_TO_PC;
  return starSourcesInBand(runtime, settings, camDistPc).length > 0;
}
