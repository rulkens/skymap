import type { Tier } from '../Tier';

/**
 * A survey star source's per-tier limits. `drawBudget` bounds the instances
 * the GPU cut emits per frame (Σ recordCount); `slots` joins it with the
 * octree pool.
 */
export type StarSourceBudgets = { readonly [T in Tier]: { readonly drawBudget: number } };
