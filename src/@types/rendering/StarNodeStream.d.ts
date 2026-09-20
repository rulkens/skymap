/**
 * StarNodeStream — one draw stream's (leaf or aggregate) per-source node
 * data, as reused grow-only flat typed arrays; only `[0, count)` of each is
 * live. Refilled every frame by `starCatalogPass`'s cut; a stream is
 * invalidated by the next cut for the same (catalog, viewSlot) pair — see
 * `createStream` in `starCatalogPass.ts` for the allocation rationale.
 */

export type StarNodeStream = {
  /** Number of valid drawn nodes — read only `[0, count)` of every array below. */
  count: number;
  /** Per-node `catalog.nodes` slot (parallel; used by `starPickLeafDraws` + debug). */
  nodeIndex: Int32Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  firstRecord: Uint32Array;
  /** Per-node instance count (leaf → N stars; aggregate → 1). */
  recordCount: Uint32Array;
  /** Per-node box origin, camera-relative Mpc — THREE f32 per node (`[3*i + k]`). */
  originRelCamMpc: Float32Array;
  /** Per-node box edge in Mpc (the in-cell offset unit = /1024). */
  cellScaleMpc: Float32Array;
  /** Per-node leaf-vs-aggregate flag: 0 = leaf, 1 = aggregate. */
  isAggregate: Uint8Array;
  /** Per-node flux-reconstruction multiplier (1 for a leaf; subtree count for an aggregate). */
  subtreeStarCount: Float32Array;
  /** Per-node draw opacity (source crossfade × node LOD fade). */
  opacity: Float32Array;
};
