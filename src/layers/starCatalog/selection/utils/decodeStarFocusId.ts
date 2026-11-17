/**
 * decodeStarFocusId — the inverse of `encodeStarFocusId`. An all-digits
 * remainder is a survey bin index, and resolves ONLY once a survey catalog is
 * loaded: before that the deep link defers at the ref stage (D6'1) rather than
 * naming a record nothing can extract. Anything else is a durable seed id,
 * looked up across the seeded tables — the boot assert in the Layer's `create`
 * is what keeps a seed id from ever looking like a bin index.
 */

import { STAR_FOCUS_PREFIX } from '../../../../services/url/starFocusId';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../seededStars/data/seededStarCatalogsBySource';
import { seedIndexOfBody } from '../../../../utils/picking/seedIndexOfBody';
import type { StarCatalogRef } from '../@types/StarCatalogRef';

export function decodeStarFocusId(id: string, surveyLoaded: boolean): StarCatalogRef | null {
  const rest = id.slice(STAR_FOCUS_PREFIX.length);
  if (/^\d+$/.test(rest)) {
    return surveyLoaded ? { type: 'starCatalog', source: 'gaiaStars', index: Number(rest) } : null;
  }
  for (const [source, row] of SEEDED_STAR_CATALOGS_BY_SOURCE) {
    const index = seedIndexOfBody(rest, row.stars);
    if (index >= 0) return { type: 'starCatalog', source, index };
  }
  return null;
}
