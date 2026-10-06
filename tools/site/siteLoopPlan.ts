import type { SiteLoopPlan } from './@types/SiteLoopPlan';

/**
 * A loop plays in a disc about 200 CSS px across, so 320 is sharp at 1x. H.264 only: measured on Voyager, CRF 33 is
 * 185 KB and keeps the stars' colour, while AV1 at the same weight turns them grey, which shows when the film takes
 * over from its still. A field of moving points (Laniakea) needs the cap; past CRF 38 the colour goes.
 */
export const SITE_LOOP_PLAN: SiteLoopPlan = {
  size: 320,
  fps: 24,
  crf: 33,
  crfStep: 2,
  crfCeiling: 38,
  maxKb: 200,
};
