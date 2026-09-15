import type { GALAXY_CATALOG_SOURCE_ROWS } from '../../../layers/galaxyCatalog/sources/galaxyCatalogSourceRows';

/**
 * The closed set of galaxy-catalog ids — the key domain for
 * `settings.galaxyCatalogs.items`. Derived from `GALAXY_CATALOG_SOURCE_ROWS`,
 * so a new catalog widens the union automatically. The runtime iterable
 * companion is `GALAXY_CATALOG_IDS` in `data/galaxyCatalog/galaxyCatalogIds`.
 */
export type GalaxyCatalogId = (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][1]['id'];
