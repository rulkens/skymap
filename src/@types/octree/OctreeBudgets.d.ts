import type { Tier } from '../data/Tier';

/**
 * An octree source's per-tier limits. `drawBudget` bounds the instances the
 * GPU cut emits per frame (Σ recordCount); `poolRecords` is how many chunk
 * records the pool holds past the index, its rows following from them
 * (ignored by an SKST row, which has no chunks).
 */
export type OctreeBudgets = {
  readonly [T in Tier]: { readonly drawBudget: number; readonly poolRecords: number };
};
