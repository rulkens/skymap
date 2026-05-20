import type { SourceType } from '../data/Source';
import type { Tier } from '../data/Tier';

/**
 * The request shape `galaxyCatalogFetcher` accepts.  Carrying tier and source
 * together (rather than baking source into the fetcher's identity) lets
 * one fetcher instance serve every survey — the slot just hands it a
 * different request when the user toggles a survey on.
 */
export type GalaxyCatalogReq = { source: SourceType; tier: Tier };
