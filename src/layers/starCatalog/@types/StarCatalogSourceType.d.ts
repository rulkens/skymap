import type { StarCatalogRegistryEntry } from './StarCatalogRegistryEntry';

/**
 * Source CODES of the star catalogs — the numeric twin of `StarCatalogId`,
 * the same way `SourceType` is the code twin of `SourceId`.
 */
export type StarCatalogSourceType = StarCatalogRegistryEntry['code'];
