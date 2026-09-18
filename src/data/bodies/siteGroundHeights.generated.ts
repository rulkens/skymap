// src/data/bodies/siteGroundHeights.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-site-ground-heights (also runs at the end
// of a non-dev Mars tile bake)
// Source of truth:  the host's own baked height tiles

import type { Vec3 } from '../../@types/math/Vec3';

/** Site id -> ground height, metres above the host's datum, bilinearly
 *  sampled from the deepest baked height tile under the site (see the
 *  generator). */
export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {
  curiosity: 2705.26299968123,
  perseverance: 4259.723814802178,
  spirit: 4267.172678396531,
  opportunity: 4713.7998046875,
};

/** Site id -> the ground's up in the site's radial (east, north, up) frame,
 *  fitted across the body's own footprint; flat ground is [0, 0, 1]. */
export const SITE_GROUND_UPS_ENU: Readonly<Record<string, Readonly<Vec3>>> = {
  curiosity: [-0.11079667413759836, 0.1262282700791423, 0.9857943603170359],
  perseverance: [-0.10170209021358262, -0.13891842417394293, 0.9850676912127495],
  spirit: [0.049402552366161055, 0.038451282141525205, 0.9980385196581251],
  opportunity: [0, 0.018182793041832276, 0.9998346793531409],
};
