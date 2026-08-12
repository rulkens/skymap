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
    "Interstellar dust in the Milky Way's own disk absorbs and reddens the light of everything behind it, so optical and near-infrared surveys — SDSS, 2MRS, GLADE among them — see essentially nothing in this band. It is an observational artifact of our vantage point inside the Galaxy, not a real gap in the universe: radio and X-ray surveys, which see through the dust, find galaxies here too, including part of the Norma cluster near the Great Attractor.",
  distanceNote:
    'A line-of-sight effect, not a distance cutoff — the band obscures the same patch of sky at every distance, from a few Mpc out to the edge of the surveyed volume.',
};
