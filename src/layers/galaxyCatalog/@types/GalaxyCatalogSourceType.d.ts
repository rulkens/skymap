import type { GalaxyCatalogRegistryEntry } from './GalaxyCatalogRegistryEntry';

/**
 * Source CODES of the galaxy catalogs — the numeric twin of `GalaxyCatalogId`,
 * the same way `SourceType` is the code twin of `SourceId`.
 */
export type GalaxyCatalogSourceType = GalaxyCatalogRegistryEntry['code'];
