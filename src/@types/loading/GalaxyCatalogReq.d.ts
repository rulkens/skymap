import type { SourceType } from '../data/SourceType';
import type { Tier } from '../data/Tier';

/**
 * The request shape `galaxyCatalogFetcher` accepts.  Carrying tier and source
 * together (rather than baking source into the fetcher's identity) lets
 * one fetcher instance serve every galaxy catalog — the slot just hands it a
 * different request when the user toggles a galaxy catalog on.
 *
 * `dissolvePrevious` is the explicit "this reload should dissolve the
 * currently-drawn buffer before replacing it" flag.  Only `setTier` sets it
 * (a tier swap is the one reload the user should see the old tier fade out
 * of); boot/demand, re-enable, and `forceReload` leave it absent and replace
 * the buffer without a dissolve.  Naming the EFFECT (dissolve) rather than
 * the cause (tier swap) keeps the commit ignorant of why — it only needs to
 * know whether to dissolve.  The fetcher ignores it; the commit reads it.
 */
export type GalaxyCatalogReq = { source: SourceType; tier: Tier; dissolvePrevious?: boolean };
