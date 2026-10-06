import type { SiteLoopPlan } from './@types/SiteLoopPlan';

/**
 * A loop plays inside a disc at most about 200 CSS pixels across, so 320 is
 * sharp at 1x and acceptable at 2x. H.264 only, measured on Voyager against a
 * moving star field: at CRF 33 it is 185 KB and keeps the stars' colour; AV1
 * (SVT, CRF 52) is the same weight and turns them grey, which shows when the
 * film takes over from its still, and needs 449 KB (CRF 40) to keep them. A
 * field of points that all move (Laniakea) is 372 KB at CRF 33 and still
 * reads at 143 KB (CRF 37), so the cap decides for it; past 38 the colour
 * goes.
 */
export const SITE_LOOP_PLAN: SiteLoopPlan = {
  size: 320,
  fps: 24,
  crf: 33,
  crfStep: 2,
  crfCeiling: 38,
  maxKb: 200,
};
