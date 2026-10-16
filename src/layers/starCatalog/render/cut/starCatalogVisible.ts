import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCatalogId } from '../../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { starSourcesInBand } from './starSourcesInBand';

/**
 * Shared visibility gate for all three star layers (leaf, aggregate,
 * upsample): ANY loaded catalog has a handed value and crossfade above 0. All
 * three delegate their `enabled` here so the aggregate producer and its
 * upsample consumer never disagree.
 */
export function starCatalogVisible(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
  ctx: Pick<FrameView, 'drawCamPos'>,
): boolean {
  const camDistPc =
    Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * SCALE_UNITS.MPC_TO_PC;
  return starSourcesInBand(runtime, fade, camDistPc).length > 0;
}
