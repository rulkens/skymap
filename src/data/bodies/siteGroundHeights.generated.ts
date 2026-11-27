// src/data/bodies/siteGroundHeights.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-site-ground-heights (also runs at the end
// of a non-dev Mars tile bake)
// Source of truth:  the host's own baked height tiles

import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';

/** Site id -> ground height, metres above the host's datum, the posed body
 *  is seated at: on the plane through the drawn ground under its contact
 *  points (see the generator). */
export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {
  curiosity: 2705.308505282968,
  perseverance: 4259.7858487507465,
  spirit: 4267.135181721833,
  opportunity: 4713.799580141359,
  soendermarken: 18.53,
  'probe-sphere-soendermarken': 31.782645399274255,
  'probe-sphere-jezero': 4262.193508312706,
};

/** Site id -> the ground's up in the site's radial (east, north, up) frame,
 *  from the same contact-point plane; flat ground is [0, 0, 1]. */
export const SITE_GROUND_UPS_ENU: Readonly<Record<string, Readonly<Vec3>>> = {
  curiosity: [-0.10317427510182296, 0.12778364288523905, 0.9864210103035067],
  perseverance: [-0.10086818171618346, -0.15118913537665252, 0.9833450336790902],
  spirit: [0.039615209957625096, 0.05209283302006237, 0.9978561879789878],
  opportunity: [0.00029929621056950194, 0.00001067163010644734, 0.9999999551539465],
  soendermarken: [0.00005304356556104682, -2.617993873899241e-7, 0.9999999985931558],
  'probe-sphere-soendermarken': [-0.0019999654826169766, 0, 0.9999980000670343],
  'probe-sphere-jezero': [0.17479659746468046, -0.08623444198913192, 0.9808209676233443],
};
