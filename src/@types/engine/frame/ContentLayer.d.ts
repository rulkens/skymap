/**
 * ContentLayer — one point in the (slab, target, blend) space, plus a
 * renderer call and an enable gate. A layer states its projection slab,
 * render target, and blend mode as data fields on the row itself, so
 * grouping by `(target, slab)` — the executor's and `timedSlotsOf`'s
 * grouping key — is a `.filter()` over `CONTENT_LAYERS` at the call site
 * rather than a hand-maintained split. See `passes/index.ts` for the
 * registry and the full layer catalog.
 *
 * There is deliberately no `deps` bag argument: a layer reads its
 * renderer straight off `state.gpu.*`, which is the end-state the
 * gpu-handle-nullability backlog item wants.
 *
 * `draw` receives a `SlabView` — the executor's single per-render-step slab
 * resolution — instead of a `ctx` the layer would otherwise have to
 * re-derive its own slab from. `drawPick` is declared now as part of the
 * locked contract (pick is a parallel program over this same registry —
 * see the design's "Pick" section) but is implemented by no layer yet;
 * layers that don't participate in picking simply omit it.
 *
 * **Invariant:** a layer's `target.{format,depth}` and `blend` must match
 * the profile baked into the renderer pipeline its `draw` calls. Where they
 * differ, the layer needs a renderer variant — `drawPick` delegating to a
 * dedicated pick renderer (rather than reusing the main renderer) is the
 * canonical example, because `r32uint` + `depth24plus` is a second pipeline
 * over the same geometry.
 */

import type { Blend } from './Blend';
import type { SlabView } from './SlabView';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { EngineState } from '../state/EngineState';

export type ContentLayer = {
  /** Stable identifier for debugging, test assertions, and the derived timing-slot list. */
  readonly name: string;
  /** Index into the per-frame slab list this layer projects through. */
  readonly slab: number;
  /** The `RenderTargetSpec.id` this layer draws into. */
  readonly target: string;
  /**
   * How this layer's fragments combine with what's already in its target.
   * Declared now as part of the locked row shape: today every layer sharing
   * a `target` also shares a `blend` (additive across the nine HDR layers,
   * OVER across the five swap-chain overlays), so nothing groups or checks
   * by blend at runtime — it's consumed only as a human-readable contract,
   * with the renderer pipeline baking the actual blend state. This value
   * must match the profile baked into the renderer pipeline its `draw`
   * calls, but nothing enforces that today; a layer↔pipeline parity check
   * is the intended guardrail once a target's layers stop agreeing on
   * blend — the near-field fold (an opaque near-field body layer sharing a
   * target with an OVER labels layer) is the first to need one.
   */
  readonly blend: Blend;
  /** Whether this layer should record draw commands this frame. Pure: no side effects. */
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  /**
   * Issue draw calls into the open render pass for this layer's
   * (target, slab) group. Called only when `enabled` returned `true`.
   * Must not call `pass.end()` — the pass lifetime is owned by the
   * executor's render step.
   */
  draw(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
  /**
   * Issue pick-ID draw calls for this layer, into the parallel pick
   * program's render pass. Optional: layers that don't participate in
   * picking simply omit it.
   *
   * **Postcondition:** every `drawPick` must leave `@group(0)` bound to the
   * shared point-pick camera prefix. Most rows satisfy this trivially — they
   * bind nothing at slot 0 and read the prefix a prior row (point-sprites)
   * left there. A row that binds its OWN slot-0 uniform (the procedural-disk
   * pick binds the disk camera) MUST restore the shared prefix before
   * returning — via `state.gpu.pickRenderer.bindCamera(pass)` — so the
   * ring / Milky-Way fold-ins drawn after it don't read the wrong buffer.
   */
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
};
