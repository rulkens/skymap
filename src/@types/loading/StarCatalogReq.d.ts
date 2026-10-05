import type { SourceType } from '../data/SourceType';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `starCatalogFetcher`: which star-catalog source, and at
 * which tier. Carries `source` because one fetcher serves EVERY `starCatalog`
 * row of the registry: the `source` dimension is what lets a future famous-star catalog reuse
 * the same fetcher unchanged. `tier` selects the `-<tier>.bin` resolution
 * variant when the source ships tiered.
 */
export type StarCatalogReq = { readonly source: SourceType; readonly tier: Tier };
