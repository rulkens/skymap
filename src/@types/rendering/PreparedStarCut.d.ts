/**
 * The per-frame star cut shared by the leaf / aggregate / upsample layers:
 * each source's partitioned streams plus source-independent shader scalars.
 */

import type { Vec3 } from '../math/Vec3';
import type { PreparedStarSource } from './PreparedStarSource';

export type PreparedStarCut = {
  sources: PreparedStarSource[];
  /**
   * The origin every node's `originRelCamMpc` is relative to; draws rebase
   * their vp about THIS, never the drawing view's own `camPos`, so a view
   * whose eye differs from the cut's still lands every node where it is.
   */
  originMpc: Readonly<Vec3>;
  sizePx: number;
  brightness: number;
  glowOverlap: number;
  aggregateIntensityCap: number;
  /** Render-on-demand wake vote — see `shouldKeepTicking`, the sole authority. */
  anyNodeFading: boolean;
};
