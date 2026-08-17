/**
 * FOREGROUND_MAX_DISTANCE_MPC — the camera-distance gate every NEAR0 foreground
 * layer ANDs into its `enabled`, so all four NEAR0 encoder steps fall away
 * wholesale at galaxy zoom: `executeFrame` already skips an empty layer group
 * and a composite whose source target went untouched.
 *
 * It maxes over region EXTENTS — a scale, matching `ctx.cam.distance`, which is
 * camera-to-TARGET. No anchor POSITION enters, so seeding a region 8 kpc out
 * cannot widen it; a distance-from-origin derivation would have.
 *
 * The ×100 margin resolves two opposed pulls: enclose the widest regime with
 * enough headroom that the star-points backdrop is not cut while that
 * neighbourhood is still being framed, yet stay under 1 Mpc so the NEAR0 passes
 * are provably idle at galaxy zoom. On today's 2.3 kpc neighbourhood it lands at
 * ~0.23 Mpc, which also keeps it inside MILKY_WAY_LABEL_NEAR_MPC (0.6) — this
 * gate is `surveyDeepZoom`'s FULL edge, and the earlier ×1000 dimmed the "You
 * are here" label in the Local Group. Both edges are pinned by this file's test.
 */

import { BODY_REGIONS } from '../../../data/bodies/bodyRegions';

const MARGIN = 100;

export const FOREGROUND_MAX_DISTANCE_MPC =
  Math.max(...BODY_REGIONS.map((region) => region.extentMpc)) * MARGIN;
