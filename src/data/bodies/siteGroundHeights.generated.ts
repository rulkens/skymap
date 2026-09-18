// src/data/bodies/siteGroundHeights.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-site-ground-heights (also runs at the end
// of a non-dev Mars tile bake)
// Source of truth:  the host's own baked height tiles

import type { Vec3 } from '../../@types/math/Vec3';

/** Site id -> ground height, metres above the host's datum, the posed body
 *  is seated at: resting on the highest drawn ground under its footprint
 *  (see the generator). */
export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {
  curiosity: 2705.365599300774,
  perseverance: 4259.82301156924,
  spirit: 4267.150660739002,
  opportunity: 4713.81073991086,
};

/** Site id -> the ground's up in the site's radial (east, north, up) frame,
 *  fitted across the body's own footprint; flat ground is [0, 0, 1]. */
export const SITE_GROUND_UPS_ENU: Readonly<Record<string, Readonly<Vec3>>> = {
  curiosity: [-0.10327335318605006, 0.12531769283404945, 0.9867269583752439],
  perseverance: [-0.09227919142659319, -0.14385560359738123, 0.9852868192274203],
  spirit: [0.04647436555169493, 0.0454836873522199, 0.9978834438607611],
  opportunity: [0, 0.00909252388406329, 0.9999586621502999],
};
