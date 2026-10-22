import type { OctreeChunkRequest } from './OctreeChunkRequest';

/** One frame's chunk wants: absent chunks the cut would open, and resident ones it reached. */
export type OctreeChunkPlan = {
  /** Descending priority, at most the pool's slot count. */
  readonly requests: readonly OctreeChunkRequest[];
  readonly touched: readonly number[];
};
