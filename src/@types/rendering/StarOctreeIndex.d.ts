/**
 * A star catalog's load-time index: flat, parallel-to-`catalog.nodes` typed
 * arrays the per-frame walk reads — see `utils/star/starOctreeIndex.ts`.
 * Indexed by node `i`, except `childIndex` (8 octant slots/node) and
 * `boxOriginPc` (3 axes/node).
 */

export type StarOctreeIndex = {
  /** `childIndex[i*8 + k]` = node `i`'s child in octant `k`, or `-1`. */
  readonly childIndex: Int32Array;
  /** Per-node `childMask`: `0 ⇒ leaf`, `!== 0 ⇒ aggregate`. */
  readonly childMask: Uint8Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  readonly firstRecord: Uint32Array;
  /** Per-node record-slice length (`node.recordCount`). */
  readonly recordCount: Uint32Array;
  /** Per-node box origin in parsecs, 3 axes (`boxOriginPc[i*3 + axis]`);
   * Float64 for the large-minus-large camera-distance subtraction. */
  readonly boxOriginPc: Float64Array;
  /** Per-node box edge in parsecs (`cellEdgePc · 2^level`). */
  readonly boxEdgePc: Float64Array;
  /** Per-node subtree leaf-star count — the flux-glow shader's multiplier. */
  readonly subtreeCounts: Uint32Array;
};
