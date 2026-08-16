/**
 * zoneOfAvoidanceInfo — the single static ZoneOfAvoidanceInfo record.
 *
 * The zone of avoidance has one instance (like the Milky Way), so its
 * focusable info is a const here rather than a catalog-row derivation. The
 * `type` discriminant keeps it on the same table-dispatch path as the other
 * FocusableTarget arms; see `data/milkyWay/milkyWayInfo.ts` for the sibling
 * this mirrors.
 */

import type { ZoneOfAvoidanceInfo } from '../../@types/engine/ZoneOfAvoidanceInfo';

export const ZONE_OF_AVOIDANCE_INFO: ZoneOfAvoidanceInfo = {
  type: 'zoneOfAvoidance',
  displayName: 'Zone of Avoidance',
  description:
    "Interstellar dust in the Milky Way's disk absorbs and reddens the light of everything behind it, so optical and near-infrared surveys such as SDSS, 2MRS and GLADE record almost nothing in this band. The gap is a shadow of our vantage point inside the Galaxy rather than a void in the universe: radio and X-ray surveys see through the dust and find galaxies here, including part of the Norma cluster near the Great Attractor.",
};
