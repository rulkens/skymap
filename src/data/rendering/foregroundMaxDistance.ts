/**
 * FOREGROUND_MAX_DISTANCE_MPC — the camera-distance gate every NEAR0 foreground
 * pass yields at, so all four NEAR0 encoder steps fall away wholesale at galaxy
 * zoom: `executeFrame` already skips an empty layer group and a composite whose
 * source target went untouched. A Layer pass declares it as its entry's
 * `FOREGROUND_RECEDE` band, applied by core; body slab rows yield through the
 * same band as their `activeBand`, so past it the body passes are never asked.
 *
 * It maxes over region EXTENTS — a scale, no anchor POSITION, so seeding a region
 * 8 kpc out cannot widen it. One measure reads it: the eye's distance from an
 * anchor (a band's `from`, else the origin; a slab row's own body), so content
 * whose band names its region keeps drawing while the eye is near that region.
 *
 * The ×100 margin resolves two opposed pulls: enclose the widest regime with
 * enough headroom that the star-points backdrop is not cut while that
 * neighbourhood is still being framed, yet stay under 1 Mpc so the NEAR0 passes
 * are provably idle at galaxy zoom. On today's 2.3 kpc neighbourhood it lands at
 * ~0.23 Mpc, which also keeps it inside the Milky Way label's near fade edge
 * (0.6 Mpc, the `youAreHere` band in `milkyWay/visibility.ts`) — this
 * gate is `SURVEY_DEEP_ZOOM`'s full edge, and the earlier ×1000 dimmed the "You
 * are here" label in the Local Group. Both edges are pinned by this file's test.
 */

import { BODY_REGIONS } from '../bodies/bodyRegions';

const MARGIN = 100;

export const FOREGROUND_MAX_DISTANCE_MPC =
  Math.max(...BODY_REGIONS.map((region) => region.extentMpc)) * MARGIN;
