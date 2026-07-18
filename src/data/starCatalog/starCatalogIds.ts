import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * STAR_CATALOG_IDS — the star-catalog-only id list, the tight key domain for
 * `settings.starCatalogs.items`.
 *
 * `SOURCE_IDS` spans every registry kind (galaxy catalogs, structures,
 * filaments, volumes, star catalogs), so keying a star-catalog-items record by
 * it would let a foreign id slip in. Filtering to `type === 'starCatalog'` here
 * gives a key domain that admits exactly the star-layer sources — the same
 * narrowing `GALAXY_CATALOG_IDS` / `STRUCTURE_IDS` do for their clusters. Order
 * is registry source-code order; it's purely iteration order, since per-star-
 * catalog state comes from the keyed `items` record, not list position.
 */
export const STAR_CATALOG_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map(
  (e) => e.id,
);
