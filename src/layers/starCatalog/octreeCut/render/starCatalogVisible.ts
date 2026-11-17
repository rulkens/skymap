import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { starSourcesInBand } from './starSourcesInBand';

/**
 * Shared visibility gate for all three star layers (leaf, aggregate,
 * upsample): ANY loaded catalog has a handed value above 0. All
 * three delegate their `enabled` here so the aggregate producer and its
 * upsample consumer never disagree.
 */
export function starCatalogVisible(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
): boolean {
  return starSourcesInBand(runtime, fade).length > 0;
}
