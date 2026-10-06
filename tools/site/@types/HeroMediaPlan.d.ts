/**
 * What `npm run site:media` cuts from the owner's recording. `videoFile` is
 * versioned: the production copy is served `immutable`, so new bytes need a new
 * name (bump the suffix, then the site's flight data follows from this plan).
 * The stills are one per flight stop, each as a landscape frame and a 9:16
 * portrait crop, at the widths and AVIF quality named here.
 */
export type HeroMediaPlan = {
  videoFile: string;
  inSec: number;
  outSec: number;
  width: number;
  fps: number;
  crf: number;
  stillLandscapeWidth: number;
  stillPortraitWidth: number;
  stillQuality: number;
};
