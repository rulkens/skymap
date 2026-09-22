/**
 * encodeStarFocusId — a star ref's `#focus=` id: `star-<seedId>` for a seeded
 * catalog (`star-sirius`, `star-S2`, `star-sun`), `star-<index>` for a survey
 * star, whose bin index is the only identity it has. `decodeStarFocusId` splits
 * the two back apart on the all-digits test a boot assert keeps unambiguous.
 */

import { STAR_FOCUS_PREFIX } from './starFocusId';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../data/bodies/seededStarCatalogsBySource';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export function encodeStarFocusId(ref: Extract<SelectionRef, { type: 'starCatalog' }>): string {
  const seedId = SEEDED_STAR_CATALOGS_BY_SOURCE.get(ref.source)?.[ref.index]?.id;
  return `${STAR_FOCUS_PREFIX}${seedId ?? ref.index}`;
}
