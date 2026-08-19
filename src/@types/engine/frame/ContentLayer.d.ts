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
   * Declared now as part of the locked row shape: most layers sharing a
   * `target` also share a `blend` (OVER across the five swap-chain
   * overlays; the near-field fold kept its opaque bodies on
   * `foreground:0` and its OVER captions on `swap`), but `hdr` already
   * mixes two — additive emission across most HDR layers, and
   * `milkyWayLayer`'s genuinely multiplicative dust pass, order-dependent
   * against the emission it darkens (see `Blend.d.ts`). This value must
   * match the profile baked into the renderer pipeline its `draw` calls,
   * but nothing enforces that today; a layer↔pipeline parity check across
   * a target's mixed blends is the intended guardrail, not yet built.
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
   * Whether this layer should record PICK draw commands this frame — the
   * gate the pick program filters `drawPick` by, in place of `enabled`.
   *
   * Optional because for MOST layers the pick set equals the draw set: what
   * you can click is exactly what you can see, so a single `enabled` gate
   * serves both and the layer omits this. A layer declares `pickEnabled` only
   * where the two genuinely differ — usually because the pick set is WIDER:
   *
   *  - `planetsLayer` draws only the partition's `flat` branch but is the
   *    SOLE pick site for `flat ∪ textured` (`texturedBodiesLayer` carries no
   *    pick aspect), so a textured-only frame (a lone textured Saturn before
   *    its untextured moons resolve into `flat`) must stay pickable while its
   *    visual row leaves the pass plan;
   *  - `bodyGlintsLayer` draws only the `glints` branch but also stamps
   *    Earth's caption-range pick footprint, so it must be admitted even with
   *    an empty `glints` branch when the Earth caption is on;
   *  - `starPointsLayer` draws the star roster but also stamps Sgr A*, which
   *    draws nothing anywhere and is invited by its caption alone.
   *
   * Keeping `enabled` narrow (draw set) preserves the executor's "a row that
   * would draw zero bodies must leave the VISUAL pass plan" invariant; the
   * wider pick gate lives here so picking is not forced to inject a no-op row
   * into the visual program.
   *
   * `milkyWayLayer` is the one row where it runs the other way — its
   * impostor keeps drawing while the camera flies through the disc but stops
   * taking clicks, because a screen-filling hit target starves everything
   * behind it. A narrower pick gate is only ever right when the content is
   * still visible but is scenery rather than a target; "invisible ⇒
   * unpickable" stays the rule and needs no gate of its own, since `enabled`
   * already carries it.
   *
   * When absent the pick program falls back to `enabled`. Pure: no side
   * effects.
   */
  pickEnabled?(state: EngineState, ctx: ReadyFrameContext): boolean;
  /**
   * Issue pick-ID draw calls for this layer, into the parallel pick
   * program's render pass. Optional: layers that don't participate in
   * picking simply omit it.
   *
   * **Postcondition (COSMO pick pass):** every `drawPick` must leave
   * `@group(0)` bound to the shared point-pick camera prefix. Most rows
   * satisfy this trivially — they bind nothing at slot 0 and read the prefix
   * a prior row (point-sprites) left there. A row that binds its OWN slot-0
   * uniform (the procedural-disk pick binds the disk camera) MUST restore
   * the shared prefix before returning — via
   * `state.gpu.galaxyPickRenderer.bindCamera(pass)` — so the ring fold-ins drawn
   * after it don't read the wrong buffer. A row alone in its slab's pick
   * pass (the Milky-Way on NEAR0) has no shared prefix to inherit or
   * preserve — it binds its own complete slot-0 camera instead.
   */
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
};
