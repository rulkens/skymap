import type { StarCatalogRegistryEntry } from './StarCatalogRegistryEntry';

/**
 * The closed set of star-catalog ids — the key domain for
 * `settings.starCatalogs.items`. Follows the `type: 'starCatalog'` registry
 * rows, so a new star catalog widens the union automatically: the streamed
 * Gaia bin plus the three seeded sets (the curated map, the Sun, the S-stars).
 * The runtime iterable companion is `STAR_CATALOG_IDS` in
 * `data/starCatalog/starCatalogIds`.
 */
export type StarCatalogId = StarCatalogRegistryEntry['id'];
