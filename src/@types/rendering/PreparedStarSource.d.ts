/**
 * PreparedStarSource — one loaded source's per-frame cut, partitioned by
 * `computeStarCut` into its leaf stream (real-star nodes) and aggregate
 * stream (interior flux-mip nodes).
 */

import type { SourceType } from '../data/SourceType';
import type { StarNodeStream } from './StarNodeStream';

export type PreparedStarSource = {
  source: SourceType;
  leaf: StarNodeStream;
  aggregate: StarNodeStream;
};
