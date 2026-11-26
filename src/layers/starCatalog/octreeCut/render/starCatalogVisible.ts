import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { viewBehindABody } from '../../../../services/engine/frame/viewBehindABody';
import { starSourcesInBand } from './starSourcesInBand';

/**
 * Shared visibility gate for all three star layers (leaf, aggregate,
 * upsample): ANY loaded catalog has a handed value above 0, and the view is
 * not filled by one body's disc (low over Earth the stars cost a quarter of a
 * phone's frame for no pixel). All three delegate their `enabled` here so the
 * aggregate producer and its upsample consumer never disagree.
 */
export function starCatalogVisible(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
  state: PassState,
  ctx: FrameView,
): boolean {
  return starSourcesInBand(runtime, fade).length > 0 && !viewBehindABody(state, ctx, NEAR0);
}
