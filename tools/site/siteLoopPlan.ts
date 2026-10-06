import type { SiteLoopPlan } from './@types/SiteLoopPlan';

/**
 * A loop plays inside a disc at most about 200 CSS pixels across, so 320 is
 * sharp at 1x and acceptable at 2x. Measured on Saturn against a moving star
 * field: AV1 at CRF 50 is 154 KB and clean, CRF 44 is 242 KB with nothing to
 * show for it; H.264 needs CRF 33 (165 KB) and is a little grainier. A field
 * of points that all move (Laniakea) is 458 KB at those settings and still
 * reads at 150 KB, so the cap decides for it.
 */
export const SITE_LOOP_PLAN: SiteLoopPlan = {
  size: 320,
  fps: 24,
  av1Crf: 50,
  h264Crf: 33,
  crfStep: 2,
  maxKb: 200,
};
