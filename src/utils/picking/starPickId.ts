/**
 * starPickId — the packed pick identity for one seeded star, and the single
 * place that decides which seed table a star's id belongs to.
 *
 * One table per seeded star catalog, never merged: a packed id is a stable
 * INDEX into one table (`seedIndexOfBody`), so concatenating them would
 * renumber every famous star and break every saved selection URL. Each table
 * packs the code of the registry row it is keyed by. `null` = SKIP; see
 * `seedIndexOfBody`'s −1 contract.
 */

import { SEEDED_STAR_CATALOGS } from '../../data/bodies/seededStarCatalogs';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';
import type { SeededStarCatalogId } from '../../@types/data/starCatalog/SeededStarCatalogId';
import type { SourceType } from '../../@types/data/SourceType';
import type { StarBody } from '../../@types/scene/StarBody';

const SEEDED_STAR_ROWS: readonly (readonly [SourceType, readonly StarBody[]])[] =
  SOURCE_ENTRIES.filter((entry) => entry.type === 'starCatalog' && entry.binBaseName === null).map(
    (entry) => [entry.code, SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId]] as const,
  );

export function starPickId(id: string): number | null {
  for (const [code, rows] of SEEDED_STAR_ROWS) {
    const index = seedIndexOfBody(id, rows);
    if (index >= 0) return packSelection(code, index + PICK_SENTINEL_OFFSET);
  }
  return null;
}
