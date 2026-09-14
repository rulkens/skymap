import type { SourceType } from '../data/SourceType';
import type { Tier } from '../data/Tier';

/**
 * The request shape `galaxyCatalogFetcher` accepts.  Carrying tier and source
 * together (rather than baking source into the fetcher's identity) lets
 * one fetcher instance serve every galaxy catalog — the slot just hands it a
 * different request when the user toggles a galaxy catalog on.
 *
 * `tier` is absent for a source that ships one file for every tier, so the request
 * and the file it names cannot disagree — build it through `galaxyCatalogRequest`,
 * never by hand.
 */
export type GalaxyCatalogReq = { source: SourceType; tier?: Tier };
