import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * GALAXY_CATALOG_IDS — the galaxy-catalog-only id list, the tight key domain for
 * `settings.galaxyCatalogs.items`.
 *
 * `SOURCE_IDS` spans every registry kind (galaxy catalogs, structures, filaments,
 * volumes), so keying a galaxy-catalog-items record by it would let a structure or
 * volume id slip in. Filtering to `type === 'galaxyCatalog'` here gives a key domain
 * that admits exactly the point-layer sources — the same narrowing
 * `STRUCTURE_CATEGORIES` does for the structure clusters. Order is registry
 * source-code order; it's purely iteration order, since per-galaxy-catalog state comes
 * from the keyed `items` record, not list position.
 */
export const GALAXY_CATALOG_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'galaxyCatalog').map(
  (e) => e.id,
);
