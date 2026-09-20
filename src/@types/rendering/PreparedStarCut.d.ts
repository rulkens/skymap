/**
 * The per-frame star cut shared by the leaf / aggregate / upsample layers:
 * each source's partitioned streams plus source-independent shader scalars.
 */

import type { PreparedStarSource } from './PreparedStarSource';

export type PreparedStarCut = {
  sources: PreparedStarSource[];
  sizePx: number;
  brightness: number;
  glowOverlap: number;
  aggregateIntensityCap: number;
  /** Render-on-demand wake vote — see `shouldKeepTicking`, the sole authority. */
  anyNodeFading: boolean;
};
