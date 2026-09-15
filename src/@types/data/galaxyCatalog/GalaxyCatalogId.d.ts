import type { GalaxyCatalogRegistryEntry } from './GalaxyCatalogRegistryEntry';

/**
 * The closed set of galaxy-catalog ids — the key domain for
 * `settings.galaxyCatalogs.items`. Follows the rows tuple, so a new catalog
 * widens the union automatically; the runtime iterable companion is
 * `GALAXY_CATALOG_IDS` in `data/galaxyCatalog/galaxyCatalogIds`.
 */
export type GalaxyCatalogId = GalaxyCatalogRegistryEntry['id'];
