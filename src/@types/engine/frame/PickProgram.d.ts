/**
 * PickProgram — the parallel per-slab pick program over the content-layer
 * registry.
 *
 * ### Why pick is NOT a FRAME member
 *
 * The visual FRAME is a linear `FrameStep[]` the executor walks once per
 * animation tick (see `frameProgram.ts`). Pick is deliberately NOT one of
 * those steps: it is a demand-driven query (a hover or click), it produces a
 * value rather than pixels on the swap chain, and it runs on its OWN command
 * encoder + `queue.submit` at a cadence set by pointer events, not the render
 * loop. Folding it into the FRAME would braid "which galaxy is under the
 * cursor?" into "draw the next frame" — two concerns that vary independently
 * (a static scene still gets hovered; a moving scene may never be picked). So
 * the pick program is a sibling of the FRAME executor, sharing only the same
 * `ContentLayer` registry: it filters that registry by `drawPick` presence +
 * `enabled`, groups the survivors by slab, and re-rasterises each slab's
 * pickable geometry through the r32uint pick pipeline into its own pick
 * target. See the renderer-unification design's "Pick" section.
 *
 * ### Why the resolve is texel reads + a CPU fold, not a GPU composite
 *
 * The screen composites slabs far-to-near with OVER blending, so what the
 * cursor lands on is whatever the NEAREST slab drew there. The naive mirror
 * would be a second GPU pass compositing every slab's pick texture into one —
 * but a pick only ever inspects a SINGLE texel (the pixel under the cursor).
 * Reading one texel per slab back to the CPU and folding them near→far with
 * `frontmostPick` reproduces the exact same occlusion result for a handful of
 * bytes, with no extra pipeline, no blend state to keep in sync with the
 * visual composite, and no whole-texture round-trip. The GPU work stays "draw
 * the pick ids"; the cross-slab occlusion rule lives in one pure CPU fold.
 */

import type { PickResult } from '../../data/PickResult';

export type PickProgram = {
  /** Stable identifier for debugging and test assertions (`'pickProgram'`). */
  readonly label: string;
  /**
   * Identify the front-most pickable surface under the given texture-space
   * cursor coordinate. Re-derives the pick-time camera as a value
   * (`pickFrameContext`), records one r32uint pass per slab that has an
   * enabled pickable layer, reads back the cursor texel from each, folds them
   * near→far (`frontmostPick`), and decodes the winner (`unpackPick`).
   *
   * Returns `null` when the engine is not ready to pick, when no slab has an
   * enabled pickable layer (no GPU work issued), when a readback is already in
   * flight, or when the cursor is over background.
   */
  pick(pickXPx: number, pickYPx: number): Promise<PickResult | null>;
  /**
   * Record the cosmological slab's pick draws into `pick:cosmo` WITHOUT a
   * readback and return the texture, for the pick-debug overlay to sample.
   * Independent of `pick()`'s in-flight guard (it never touches the staging
   * buffers). Returns `null` when the engine is not ready or no cosmological
   * pickable layer is enabled.
   */
  renderForDebug(): GPUTexture | null;
  /** Release every per-slab pick target, depth texture, and staging buffer. */
  destroy(): void;
};
