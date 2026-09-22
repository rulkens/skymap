/**
 * SEEDED_STAR_CATALOGS_BY_SOURCE — the single place a seeded star's source
 * code, seed-table id and star table meet. One row per source, NEVER merged:
 * a ref's `index` indexes ONE table, so concatenating would renumber every
 * famous star and break every saved `star-` link.
 */

import { SEEDED_STAR_CATALOGS } from './seededStarCatalogs';
import { SOURCE_ENTRIES } from '../sourceEntries';
import type { SeededStarCatalogId } from '../../@types/data/starCatalog/SeededStarCatalogId';
import type { SeededStarCatalogRow } from '../../@types/data/starCatalog/SeededStarCatalogRow';
import type { StarCatalogSourceType } from '../../@types/data/starCatalog/StarCatalogSourceType';

export const SEEDED_STAR_CATALOGS_BY_SOURCE: ReadonlyMap<
  StarCatalogSourceType,
  SeededStarCatalogRow
> = new Map(
  SOURCE_ENTRIES.filter((entry) => entry.type === 'starCatalog' && entry.binBaseName === null).map(
    (entry) => {
      const id = entry.id as SeededStarCatalogId;
      return [entry.code as StarCatalogSourceType, { id, stars: SEEDED_STAR_CATALOGS[id] }] as const;
    },
  ),
);
