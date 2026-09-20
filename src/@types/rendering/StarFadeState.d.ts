/**
 * StarFadeState — one catalog's persistent per-node LOD-fade bookkeeping:
 * flat typed arrays indexed by node index, plus a two-stamp scheme (`inCutFrame`
 * / `activeFrame`) that replaces a `Map<nodeIndex, …>`'s membership test. See
 * `fadeStateByCatalog` in `starCatalogPass.ts` for the full scheme.
 */

export type StarFadeState = {
  /** Per-node current LOD opacity; meaningful only while the node is active. */
  opacity: Float32Array;
  /** Frame stamp: node was in THIS frame's walk cut (target 1). Set in pass 1. */
  inCutFrame: Uint32Array;
  /** Frame stamp: node was appended to THIS frame's active list (drawn ≥ 0). */
  activeFrame: Uint32Array;
  /** This frame's active node indices, filled `[0, activeCount)`; sized to N. */
  activeList: Int32Array;
  /** The PREVIOUS frame's active node indices, `[0, prevActiveCount)`. */
  prevActiveList: Int32Array;
  /** Number of nodes appended to `prevActiveList` (last frame's active count). */
  prevActiveCount: number;
  /** The catalog's own last-drawn frame time; `null` snaps the first frame. */
  clockMs: number | null;
  /** Monotonic per-catalog counter; `++`ed each advance, so stamp 0 is never live. */
  frame: number;
};
