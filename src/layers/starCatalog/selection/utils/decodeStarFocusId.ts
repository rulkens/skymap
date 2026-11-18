/**
 * decodeStarFocusId — the inverse of `encodeStarFocusId`. An all-digits
 * remainder is a survey bin index, and resolves ONLY once a survey catalog is
 * loaded: before that it is `pending`, so the deep link defers (D6'1) rather than
 * naming a record nothing can extract. Anything else is a durable seed id,
 * looked up across the seeded tables — the boot assert in the Layer's `create`
 * is what keeps a seed id from ever looking like a bin index.
 */

import { STAR_FOCUS_PREFIX } from '../../../../services/url/starFocusId';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../seededStars/data/seededStarCatalogsBySource';
import { seedIndexOfBody } from '../../../../utils/picking/seedIndexOfBody';
import type { StarCatalogRef } from '../@types/StarCatalogRef';
import type { FocusResolution } from '../../../../@types/engine/selection/FocusResolution';

export function decodeStarFocusId(
  id: string,
  surveyLoaded: boolean,
): FocusResolution<StarCatalogRef> {
  const rest = id.slice(STAR_FOCUS_PREFIX.length);
  if (/^\d+$/.test(rest)) {
    return surveyLoaded
      ? { kind: 'hit', ref: { type: 'starCatalog', source: 'gaiaStars', index: Number(rest) } }
      : { kind: 'pending' };
  }
  for (const [source, row] of SEEDED_STAR_CATALOGS_BY_SOURCE) {
    const index = seedIndexOfBody(rest, row.stars);
    if (index >= 0) return { kind: 'hit', ref: { type: 'starCatalog', source, index } };
  }
  return { kind: 'absent' };
}
