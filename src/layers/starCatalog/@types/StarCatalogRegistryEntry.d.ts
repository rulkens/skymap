import type { STAR_CATALOG_SOURCE_RECORD } from '../sources/starCatalogSourceRecord';

/**
 * A star-catalog entry as the Layer's rows declare it, with `code` and `id` at
 * their literal unions (`StarCatalogSourceEntry` widens them to number/string).
 * Derived from the Layer's own record, so adding a catalog widens the union automatically.
 */
export type StarCatalogRegistryEntry =
  (typeof STAR_CATALOG_SOURCE_RECORD)[keyof typeof STAR_CATALOG_SOURCE_RECORD];
