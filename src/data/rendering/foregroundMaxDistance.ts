/**
 * FOREGROUND_MAX_DISTANCE_MPC — the camera-distance gate every NEAR0 foreground
 * pass yields at, so all four NEAR0 encoder steps fall away wholesale at galaxy
 * zoom: `executeFrame` already skips an empty layer group and a composite whose
 * source target went untouched. A Layer pass declares it as its entry's
 * `FOREGROUND_RECEDE` band, applied by core; core's body passes AND it into
 * `enabled` by hand until the body Layers take them over, and the star passes
 * do too, because their entry carries `bodies` and scene-body admission cannot
 * measure a band.
 *
 * It maxes over region EXTENTS — a scale, no anchor POSITION, so seeding a region
 * 8 kpc out cannot widen it. Two measures read it until the hand gates go: the
 * hand gates compare `ctx.cam.distance` (camera-to-TARGET), the band compares
 * the eye's distance from the origin, so a region anchored past the band would
 * have its Layer rows cut while still framed.
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
