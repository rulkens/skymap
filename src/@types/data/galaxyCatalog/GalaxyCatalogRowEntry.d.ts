import type { GALAXY_CATALOG_SOURCE_ROWS } from '../../../layers/galaxyCatalog/sources/galaxyCatalogSourceRows';

/**
 * A galaxy-catalog entry as `GALAXY_CATALOG_SOURCE_ROWS` declares it, with
 * `code` and `id` at their literal unions. Derived from the tuple because
 * `GalaxyCatalogSourceEntry`'s `code: number` / `id: string` would need a cast.
 */
export type GalaxyCatalogRowEntry = (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][1];
