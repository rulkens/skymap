/**
 * A star node table's load-time index (`utils/star/starOctreeIndex.ts`): flat
 * arrays parallel to the table's rows. Indexed by row `i`, except `childIndex`
 * (8 octant slots per row), `boxOriginPc` (3 axes per row) and `chunkRoots` (a row list).
 */
export type StarOctreeIndex = {
  /** `childIndex[i*8 + k]` = row `i`'s child in octant `k`, or `-1`. */
  readonly childIndex: Int32Array;
  /** Box min corner in parsecs, f64 for the large-minus-large camera-distance subtraction. */
  readonly boxOriginPc: Float64Array;
  /** `cellEdge · 2^level`, parsecs. */
  readonly boxEdgePc: Float64Array;
  /** Rows of the childful chunk roots, ascending. */
  readonly chunkRoots: Int32Array;
};
