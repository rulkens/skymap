/**
 * One catalog's persistent per-node LOD-fade bookkeeping — see
 * `layers/starCatalog/render/cut/starFadeState.ts` for the full scheme.
 */

export type StarFadeState = {
  /** Per-node current LOD opacity; meaningful only while the node is active. */
  opacity: Float32Array;
  /** Frame stamp: node was in THIS frame's walk cut (target 1). */
  inCutFrame: Uint32Array;
  /** Frame stamp: node was appended to THIS frame's active list. */
  activeFrame: Uint32Array;
  /** This frame's active node indices, filled `[0, activeCount)`. */
  activeList: Int32Array;
  /** The PREVIOUS frame's active node indices, `[0, prevActiveCount)`. */
  prevActiveList: Int32Array;
  prevActiveCount: number;
  /** The catalog's own last-drawn frame time; `null` snaps the first frame. */
  clockMs: number | null;
  /** Monotonic per-catalog counter; `++`ed each advance. */
  frame: number;
};
