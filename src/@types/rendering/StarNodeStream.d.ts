/**
 * One draw stream's (leaf or aggregate) per-source node data as reused
 * grow-only flat typed arrays; only `[0, count)` is live — see
 * `createStarNodeStream` in `renderers/starCatalog/cut/starNodeStream.ts`.
 */

export type StarNodeStream = {
  count: number;
  /** Per-node `catalog.nodes` slot (used by `starPickLeafDraws` + debug). */
  nodeIndex: Int32Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  firstRecord: Uint32Array;
  /** Per-node instance count (leaf → N stars; aggregate → 1). */
  recordCount: Uint32Array;
  /** Per-node box origin, camera-relative Mpc — 3 f32/node (`[3*i + k]`). */
  originRelCamMpc: Float32Array;
  /** Per-node box edge in Mpc (the in-cell offset unit = /1024). */
  cellScaleMpc: Float32Array;
  /** Per-node leaf-vs-aggregate flag: 0 = leaf, 1 = aggregate. */
  isAggregate: Uint8Array;
  /** Per-node flux-reconstruction multiplier (1 leaf; subtree count aggregate). */
  subtreeStarCount: Float32Array;
  /** Per-node draw opacity (source crossfade × node LOD fade). */
  opacity: Float32Array;
};
