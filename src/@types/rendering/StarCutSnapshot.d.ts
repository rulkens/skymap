/**
 * StarCutSnapshot — `walkStarOctreeCut`'s per-frame cut as a struct-of-arrays
 * view over its reused scratch: `count` valid draws, `i ∈ [0, count)`. The
 * arrays are the full grow-only capacity and are INVALIDATED by the next
 * `walkStarOctreeCut` call.
 */

export type StarCutSnapshot = {
  /** Number of valid draws — only `[0, count)` of the arrays below are live. */
  readonly count: number;
  /** Per-draw node index (`catalog.nodes` slot). */
  readonly nodeIndex: Int32Array;
  /** Per-draw record-slice base (`node.firstRecord`). */
  readonly firstRecord: Uint32Array;
  /** Per-draw instance count (leaf → N stars; aggregate → 1). */
  readonly recordCount: Uint32Array;
};
