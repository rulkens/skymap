import type { SourceType } from '../data/SourceType';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `starCatalogFetcher`: which star-catalog source, and at
 * which tier. Carries `source` because one fetcher serves EVERY `starCatalog`
 * row of the registry: the `source` dimension is what lets a future famous-star catalog reuse
 * the same fetcher unchanged. `tier` selects the `-<tier>.bin` file for an
 * `skst` row and the chunk pool's size for an `octree` row.
 */
export type StarCatalogReq = {
  readonly source: SourceType;
  readonly tier: Tier;
  /** Debug pool size replacing the tier's `slots`; null = the tier's own. */
  readonly slotsOverride: number | null;
};
