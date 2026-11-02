/**
 * isBodyRegionId — splits a band's `from` into a region (measured from its anchor) and a
 * positioned id (measured from itself). `galactic-centre` is both a region and a place; the
 * region wins, and since that region anchors at the place, both readings give one distance.
 */

import { BODY_REGIONS } from '../../data/bodies/bodyRegions';
import type { BodyRegionId } from '../../@types/data/BodyRegionId';
import type { PositionedId } from '../../@types/scene/PositionedId';

export function isBodyRegionId(id: BodyRegionId | PositionedId): id is BodyRegionId {
  return BODY_REGIONS.some((region) => region.id === id);
}
