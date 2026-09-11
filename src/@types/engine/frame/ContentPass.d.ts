/**
 * ContentPass — one renderer call and its enable gate. WHERE it draws is not
 * here: `FRAME_ORDER` (`frameOrder.ts`) names the pass on the line that states
 * the target, the slab and the draw order, so a row and the order cannot
 * disagree.
 *
 * There is deliberately no `deps` bag argument: a pass reads its renderer
 * straight off `state.gpu.*`, which is the end-state the gpu-handle-nullability
 * backlog item wants.
 *
 * **Invariant:** the blend profile baked into the renderer pipeline a `draw`
 * call uses must suit the format + depth of the target its `FRAME_ORDER` line
 * names. Where they differ the pass needs a renderer variant — `drawPick`
 * delegating to a dedicated pick renderer (rather than reusing the main one)
 * is the canonical example, because `r32uint` + `depth24plus` is a second
 * pipeline over the same geometry.
 */

import type { SlabView } from './SlabView';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { PassState } from './PassState';

export type ContentPass = {
  /** Stable identifier: what `FRAME_ORDER` names, and the timing-slot list derives. */
  readonly name: string;
  /**
   * Whether this pass should record draw commands this frame, given the
   * step's already-resolved `SlabView` — a pass on a body roster reads
   * `view.slab.frame.bodyId` to gate its own row. Pure: no side effects.
   */
  enabled(state: PassState, ctx: ReadyFrameContext, view: SlabView): boolean;
  /**
   * Issue draw calls into the open render pass for this step. Called only when
   * `enabled` returned `true`. Must not call `pass.end()` — the pass lifetime
   * is owned by the executor's render step.
   */
  draw(pass: GPURenderPassEncoder, view: SlabView, ctx: ReadyFrameContext, state: PassState): void;
  /**
   * Whether this pass should record PICK draw commands this frame — the
   * gate the pick program filters `drawPick` by, in place of `enabled`.
   *
   * Optional because for MOST passes the pick set equals the draw set: what
   * you can click is exactly what you can see, so a single `enabled` gate
   * serves both and the pass omits this. A pass declares `pickEnabled` only
   * where the two genuinely differ — usually because the pick set is WIDER:
   *
   *  - `planetsPass` draws only the partition's `flat` branch but is the
   *    SOLE pick site for `flat ∪ textured` (`texturedBodiesPass` carries no
   *    pick aspect), so a textured-only frame (a lone textured Saturn before
   *    its untextured moons resolve into `flat`) must stay pickable while its
   *    visual row leaves the pass plan;
   *  - `bodyGlintsPass` draws only the `glints` branch but also stamps
   *    Earth's caption-range pick footprint, so it must be admitted even with
   *    an empty `glints` branch when the Earth caption is on;
   *  - `starPointsPass` draws the star roster but also stamps Sgr A*, which
   *    draws nothing anywhere and is invited by its caption alone.
   *
   * Keeping `enabled` narrow (draw set) preserves the executor's "a row that
   * would draw zero bodies must leave the VISUAL pass plan" invariant; the
   * wider pick gate lives here so picking is not forced to inject a no-op row
   * into the visual program.
   *
   * `milkyWayPass` is the one row where it runs the other way — its
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
  pickEnabled?(state: PassState, ctx: ReadyFrameContext, view: SlabView): boolean;
  /**
   * Issue pick-ID draw calls for this pass, into the parallel pick
   * program's render pass. Optional: passes that don't participate in
   * picking simply omit it.
   */
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: PassState,
  ): void;
};
