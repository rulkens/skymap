/** What `referenceStarCut` returns: one frame of `cut.wesl`'s output. */

export type ReferenceStarCut = {
  /** Bins at or above this refine (`hist[CUT_BINS]`). */
  readonly cutBin: number;
  /** Every node's opacity after this frame's fade step. */
  readonly opacity: Float32Array;
  /** Leaf-list entries, `node | block << LEAF_BLOCK_INDEX_SHIFT`, in emission order. */
  readonly leafEntries: readonly number[];
  /** Aggregate-list entries: node indices. */
  readonly aggregates: readonly number[];
};
