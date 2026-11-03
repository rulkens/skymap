import type { GalaxyCatalogSourceType } from './GalaxyCatalogSourceType';
import type { Tier } from '../../../@types/data/Tier';

/**
 * Request shape for `galaxyOctreeFetcher`. The index is one tier-less file; `tier` sizes the
 * chunk pool, and a tier change drifts the request so the slot reloads in place (the hashed
 * index comes back from the browser cache) and its commit re-installs the pool.
 */
export type GalaxyOctreeReq = { readonly source: GalaxyCatalogSourceType; readonly tier: Tier };
