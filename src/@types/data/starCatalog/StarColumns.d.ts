/**
 * A star object's decoded record columns, `count` records in node-row order. Both formats
 * land here: SKST through `starOctreeFromSkst`, the octree through `starColumnsOf`.
 */
export type StarColumns = {
  readonly count: number;
  /** 3·count, a fraction of the owning node's box ×65536 (`OFFSET_FRACTION_LEVELS`). */
  readonly offset: Uint16Array;
  /** LUT bin centres, so `absMagToLutIndex` recovers the index exactly. */
  readonly absMag: Float32Array;
  readonly colourIndex: Float32Array;
};
