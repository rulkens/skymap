// src/data/bodies/siteGroundHeights.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-site-ground-heights (also runs at the end
// of a non-dev Mars tile bake)
// Source of truth:  the host's own baked height tiles

/** Site id -> ground height, metres above the host's datum, bilinearly
 *  sampled from the deepest baked height tile under the site (see the
 *  generator). */
export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {
  curiosity: 2705.26299968123,
  perseverance: 4259.723814802178,
  spirit: 4267.172678396531,
  opportunity: 4713.7998046875,
};
