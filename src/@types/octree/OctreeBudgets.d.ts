import type { Tier } from '../data/Tier';

/**
 * A survey star source's per-tier limits. `drawBudget` bounds the instances
 * the GPU cut emits per frame (Σ recordCount); `slots` is the octree chunk
 * pool's size (ignored by an SKST row, which has no chunks).
 */
export type OctreeBudgets = {
  readonly [T in Tier]: { readonly drawBudget: number; readonly slots: number };
};
