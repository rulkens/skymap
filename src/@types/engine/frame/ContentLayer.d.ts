/**
 * ContentLayer — one point in the (slab, target, blend) space, plus a
 * renderer call and an enable gate. Replaces the pre-unification
 * `HDR_PASSES` / `UI_PASSES` arrays and the hand-wired foreground draw
 * calls: instead of which array a pass lives in implicitly fixing its
 * projection, precision, blend, and target all at once, a `ContentLayer`
 * states all three axes as data and the executor resolves them uniformly.
 * See the renderer unification design's "ContentLayer" section for the
 * full migration table from today's passes.
 *
 * There is deliberately no `deps: PassDeps` argument (contrast with the
 * pre-unification `Pass` type in this same directory): a layer reads its
 * renderer straight off `state.gpu.*`, which is the end-state the
 * gpu-handle-nullability backlog item wants. `PassDeps` sheds its renderer
 * fields once every current pass has migrated to a `ContentLayer`.
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
  /** How this layer's fragments combine with what's already in its target. */
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
   * program's render pass. Optional: implemented by no layer until the
   * pick path migrates onto this registry.
   */
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
};
