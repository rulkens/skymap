/**
 * blackHoleAnchorId — a `BlackHoleRow`'s pose key, derived from the sky bake
 * it names (deletion-audit N2: the row no longer carries its own copy).
 * `BodyRegion.anchorId` is typed as a bare `string` for regions in general,
 * but every capture's anchor in this table is in fact a `PlaceId`.
 */

import { BLACK_HOLE_SKY_CAPTURES } from '../../lensing/data/blackHoleSkyCaptures';
import type { BlackHoleRow } from '../../@types/BlackHoleRow';
import type { PlaceId } from '../../../../@types/scene/PlaceId';

export function blackHoleAnchorId(row: BlackHoleRow): PlaceId {
  return BLACK_HOLE_SKY_CAPTURES[row.capture].anchor.anchorId as PlaceId;
}
