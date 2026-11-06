/**
 * starSearch — the Layer's `search` feed: one primary palette row per seeded star
 * (Sun, S-stars, famous stars), static, so it yields once. The survey bin is
 * never searchable. Names come from the same map the aliases are shown from, so a
 * row displays exactly the names it can be found by.
 */

import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../data/bodies/seededStarCatalogsBySource';
import { BODY_SEARCH_NAMES } from '../../../../data/bodies/bodySearchNames';
import { encodeStarFocusId } from '../utils/encodeStarFocusId';
import { seededStarChip } from '../utils/seededStarChip';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';

export async function* starSearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield [...SEEDED_STAR_CATALOGS_BY_SOURCE].flatMap(([source, row]) =>
    row.stars.map((star, index) => ({
      id: encodeStarFocusId({ type: 'starCatalog', source, index }),
      class: 'primary' as const,
      names: BODY_SEARCH_NAMES.get(star.id) ?? [star.label],
      chip: seededStarChip(star.id),
    })),
  );
}
