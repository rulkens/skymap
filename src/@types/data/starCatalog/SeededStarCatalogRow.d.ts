import type { SeededStarCatalogId } from './SeededStarCatalogId';
import type { StarBody } from '../../scene/StarBody';

/** One seeded catalog's `SEEDED_STAR_CATALOGS_BY_SOURCE` row — its own seed
 *  table id alongside the stars, keyed by source in the map itself. */
export type SeededStarCatalogRow = {
  readonly id: SeededStarCatalogId;
  readonly stars: readonly StarBody[];
};
