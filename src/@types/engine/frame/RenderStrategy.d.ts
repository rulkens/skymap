/**
 * RenderStrategy — how the executor turns a `'render'` step's layer group
 * into GPU passes; a property of *how* a render step executes, not of the
 * frame program itself.
 *
 * Production encodes every layer in a target's group into one merged
 * `beginRenderPass` (tile-local on Apple Silicon — OVER blends need the
 * coherent `dst.color` a single pass gives them). Enabling `?gpuTimings`
 * instead opens one pass per layer so each can carry its own
 * `timestampWrites`, since WebGPU attaches timestamps at pass boundaries
 * only. That timing/production fork is essential (both encode the exact
 * same draw calls; only the pass boundaries differ) but it varies
 * independently of which layers are in the group — hence a strategy
 * argument the executor applies uniformly, rather than the pre-unification
 * `encodeHdrSingle` / `encodeHdrSplit` pair of near-duplicate functions.
 */

export type RenderStrategy = 'merged' | 'perLayerTimed';
