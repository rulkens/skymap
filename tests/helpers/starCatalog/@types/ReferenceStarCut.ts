/** What `referenceStarCut` returns: one frame of `cut.wesl`'s output. */

export type ReferenceStarCut = {
  /** Bins at or above this refine (`hist[CUT_BINS]`). */
  readonly cutBin: number;
  /** Every row's two fade channels after this frame's step, `i * 2 + (own 0 | blob 1)`. */
  readonly opacity: Float32Array;
  /** Leaf-list entries from own records, `node | block << LEAF_BLOCK_INDEX_SHIFT`, in emission order. */
  readonly leafEntries: readonly number[];
  /** Aggregate-list entries from blobs: row indices. */
  readonly aggregates: readonly number[];
};
