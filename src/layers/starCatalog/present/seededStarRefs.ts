/**
 * SEEDED_STAR_REFS — every seeded star's body id → its seed-table ref, built from
 * `SEEDED_STAR_CATALOGS_BY_SOURCE` one table per source, never merged: a ref's
 * `seedIndex` means nothing without the source beside it.
 */

import type { SeededStarRef } from '../@types/SeededStarRef';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';

export const SEEDED_STAR_REFS: ReadonlyMap<string, SeededStarRef> = new Map(
  [...SEEDED_STAR_CATALOGS_BY_SOURCE].flatMap(([source, row]) =>
    row.stars.map((star, seedIndex) => [star.id, { item: row.id, source, seedIndex }] as const),
  ),
);
