import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `galaxyOctreeFetcher`. The index is one tier-less file; `tier` sizes the
 * chunk pool, and a tier change drifts the request so the slot reloads in place (the hashed
 * index comes back from the browser cache) and its commit re-installs the pool.
 */
export type GalaxyOctreeReq = { readonly source: GalaxyCatalogSourceType; readonly tier: Tier };
