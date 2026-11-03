import type { GALAXY_CATALOG_SOURCE_RECORD } from '../sources/galaxyCatalogSourceRecord';

/**
 * A galaxy-catalog entry as the Layer's rows declare it, with `code` and `id` at
 * their literal unions (`GalaxyCatalogSourceEntry` widens them to number/string).
 * Derived from the Layer's own record, so adding a catalog widens the union automatically.
 */
export type GalaxyCatalogRegistryEntry =
  (typeof GALAXY_CATALOG_SOURCE_RECORD)[keyof typeof GALAXY_CATALOG_SOURCE_RECORD];
