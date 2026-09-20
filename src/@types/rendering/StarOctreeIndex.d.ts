/**
 * StarOctreeIndex — a star catalog's load-time index: flat, parallel-to-
 * `catalog.nodes` typed arrays the per-frame walk reads. Indexed by node `i ∈
 * [0, nodeCount)`, except `childIndex` (8 octant slots/node) and
 * `boxOriginPc` (3 axes/node).
 */

export type StarOctreeIndex = {
  /**
   * `childIndex[i*8 + k]` is node `i`'s child in octant `k`, or `-1` when
   * absent. Resolves the whole descent with no hashing.
   */
  readonly childIndex: Int32Array;
  /**
   * Per-node octree level; sizes the box (`cellEdgePc · 2^level`). Does NOT
   * discriminate leaf from aggregate — a fat leaf lives at `level > 0` yet is
   * a leaf (`childMask === 0` is that test).
   */
  readonly level: Uint8Array;
  /**
   * Per-node `childMask` (8-bit octant occupancy) — the leaf-vs-aggregate
   * discriminant: `0 ⇒ leaf` (records are real stars), `!== 0 ⇒ aggregate`
   * (a flux-mip standing in for a subtree).
   */
  readonly childMask: Uint8Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  readonly firstRecord: Uint32Array;
  /** Per-node record-slice length (`node.recordCount`). */
  readonly recordCount: Uint32Array;
  /**
   * Per-node box origin in parsecs, 3 axes each (`boxOriginPc[i*3 + axis]`).
   * Float64: the box distance is a large-minus-large subtraction against a
   * parsec-scale grid corner that can sit thousands of pc from the Sun.
   */
  readonly boxOriginPc: Float64Array;
  /** Per-node box edge in parsecs (`cellEdgePc · 2^level`). */
  readonly boxEdgePc: Float64Array;
  /**
   * Per-node subtree leaf-star count: a leaf's own `recordCount`, an
   * aggregate's sum over its present children — the multiplier the flux-glow
   * shader uses to rebuild summed light from a record's stored MEAN flux.
   */
  readonly subtreeCounts: Uint32Array;
};
