import type { HeroStill } from './HeroStill';

/**
 * What `npm run site:media` cuts from the owner's recording. `videoFile` is
 * versioned: the production copy is served `immutable`, so new bytes need a new
 * name (bump the suffix, then the site's flight data follows from this plan).
 */
export type HeroMediaPlan = {
  videoFile: string;
  inSec: number;
  outSec: number;
  width: number;
  fps: number;
  crf: number;
  stills: readonly HeroStill[];
};
