import type { StarCatalogId } from '../../@types/StarCatalogId';

/**
 * A star's ref, one kind for all four catalogs. `index` is the tier-scoped record index for
 * the Gaia survey (a stale one after a tier swap warns and nulls) and the seed-table index
 * for a seeded catalog.
 */
export type StarCatalogRef = {
  readonly type: 'starCatalog';
  readonly source: StarCatalogId;
  readonly index: number;
};
