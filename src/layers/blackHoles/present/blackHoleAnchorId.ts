/**
 * blackHoleAnchorId — a `BlackHoleRow`'s pose key, derived from the sky bake
 * it names (deletion-audit N2: the row no longer carries its own copy).
 * `BodyRegion.anchorId` is typed as a bare `string` for regions in general,
 * but every capture's anchor in this table is in fact a `PlaceId`.
 */

import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import type { PlaceId } from '../../../@types/scene/PlaceId';

export function blackHoleAnchorId(row: BlackHoleRow): PlaceId {
  return CUBEMAP_CAPTURES[row.capture].anchor.anchorId as PlaceId;
}
