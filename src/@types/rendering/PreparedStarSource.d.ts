/** One loaded source's per-frame cut, partitioned by `computeStarCut` into
 * its leaf (real-star) and aggregate (flux-mip) streams. */

import type { SourceType } from '../data/SourceType';
import type { StarNodeStream } from './StarNodeStream';

export type PreparedStarSource = {
  source: SourceType;
  leaf: StarNodeStream;
  aggregate: StarNodeStream;
};
