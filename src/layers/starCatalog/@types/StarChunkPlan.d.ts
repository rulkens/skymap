import type { StarChunkRequest } from './StarChunkRequest';

/** One frame's chunk wants: absent chunks the cut would open, and resident ones it reached. */
export type StarChunkPlan = {
  /** Descending priority. */
  readonly requests: readonly StarChunkRequest[];
  readonly touched: readonly number[];
};
