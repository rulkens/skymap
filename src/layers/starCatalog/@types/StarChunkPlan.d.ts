import type { StarChunkRequest } from './StarChunkRequest';

/** One frame's chunk wants: absent chunks the cut would open, and resident ones it reached. */
export type StarChunkPlan = {
  /** Descending priority, at most the pool's slot count. */
  readonly requests: readonly StarChunkRequest[];
  readonly touched: readonly number[];
};
