/**
 * SEEDED_STAR_CATALOGS_BY_SOURCE — each seeded star catalog's table keyed by the
 * source code a pick and a `starCatalog` ref name it with.
 *
 * One table per source, NEVER merged: a ref's `index` indexes ONE of them, so
 * concatenating would renumber every famous star and break every saved `star-`
 * link. The single place a star's source code and its seed table meet — the
 * Layer's selection row and both `star-` URL helpers read it.
 */

import { SEEDED_STAR_CATALOGS } from './seededStarCatalogs';
import { SOURCE_ENTRIES } from '../sourceEntries';
import type { SeededStarCatalogId } from '../../@types/data/starCatalog/SeededStarCatalogId';
import type { StarCatalogSourceType } from '../../@types/data/starCatalog/StarCatalogSourceType';
import type { StarBody } from '../../@types/scene/StarBody';

export const SEEDED_STAR_CATALOGS_BY_SOURCE: ReadonlyMap<
  StarCatalogSourceType,
  readonly StarBody[]
> = new Map(
  SOURCE_ENTRIES.filter((entry) => entry.type === 'starCatalog' && entry.binBaseName === null).map(
    (entry) =>
      [
        entry.code as StarCatalogSourceType,
        SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId],
      ] as const,
  ),
);
