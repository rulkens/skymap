/**
 * PreparedStarCut — the per-frame star cut shared by the leaf / aggregate /
 * upsample layers: each source's partitioned streams plus the source-
 * independent shader scalars, computed once and forwarded to every draw.
 */

import type { PreparedStarSource } from './PreparedStarSource';

export type PreparedStarCut = {
  sources: PreparedStarSource[];
  sizePx: number;
  brightness: number;
  glowOverlap: number;
  aggregateIntensityCap: number;
  /**
   * Render-on-demand wake vote: true while any node's LOD ramp is mid-flight
   * this frame. Surfaced as data, not fired here — `shouldKeepTicking` is the
   * single authority on must-the-loop-tick (see `starCatalogPass`).
   */
  anyNodeFading: boolean;
};
