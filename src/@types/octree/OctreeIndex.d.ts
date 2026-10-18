/**
 * A star node table's load-time index (`utils/octree/octreeIndex.ts`): flat
 * arrays parallel to the table's rows. Indexed by row `i`, except `childIndex`
 * (8 octant slots per row) and `boxOriginPc` (3 axes per row).
 */
export type OctreeIndex = {
  /** `childIndex[i*8 + k]` = row `i`'s child in octant `k`, or `-1`. */
  readonly childIndex: Int32Array;
  /** Box min corner in parsecs, f64 for the large-minus-large camera-distance subtraction. */
  readonly boxOriginPc: Float64Array;
  /** `cellEdge · 2^level`, parsecs. */
  readonly boxEdgePc: Float64Array;
  /** 1 when row `i` is a chunk root or one lies below it in this object: the planner's prune. */
  readonly holdsChunkRoot: Uint8Array;
};
