/**
 * Pass — the per-frame draw-block abstraction.
 *
 * A `Pass` is one discrete unit of GPU work that records into the
 * in-flight HDR `GPURenderPassEncoder`.  Pre-D.2 the four HDR draw
 * blocks (point sprites, galaxy thumbnails, filament skeleton, Milky
 * Way layer) lived as inline `if (...)` branches inside
 * `renderFrame.ts`.  After D.2 each block becomes a one-file unit
 * implementing this interface, and `renderFrame` collapses to a small
 * for-loop over a `readonly Pass[]` array.
 *
 * ### Why an interface instead of free functions
 *
 * The naive shape would be `(pass, ctx, state, deps) =>
 * boolean | void` — return `false` to skip, otherwise draw.  That
 * works mechanically but loses two useful properties:
 *
 *   1. **Tests can't introspect "would this pass have drawn?"
 *      independently of "did it actually draw?"**  Splitting `enabled`
 *      from `draw` lets a unit test assert the gate predicate without
 *      stubbing a `GPURenderPassEncoder`.
 *   2. **No place to hang a stable name.**  Debug breadcrumbs (and the
 *      one ordering test) need to identify a pass without grep'ing
 *      function references.  A `name: string` field slots in
 *      naturally on the object literal.
 *
 * ### Why a `const` object literal per file, not a class
 *
 * Passes are stateless across frames — every input is read fresh from
 * `state` / `ctx` / `deps` per call.  A class adds the
 * "where do I instantiate this?" question and the inheritance escape
 * hatch that the project's `type` aliases convention (CLAUDE.md)
 * deliberately rejects.  `export const xyzPass: Pass = { ... }` is
 * the lightest shape that satisfies the type and keeps every pass a
 * grep-friendly module.
 *
 * ### Why `PassDeps` separately from `ctx`
 *
 * `ReadyFrameContext` (D.1) carries the *derived per-frame snapshot*:
 * camera, view-projection matrix, viewport size, and the three
 * GPU/subsystem handles that ride along once the bootstrap gate
 * passes.  `PassDeps` carries the *renderer references* — handles
 * that pre-D.2 were threaded through `RenderFrameInput`'s top-level
 * fields and that don't conceptually belong to "the camera's frame
 * snapshot".  Splitting the two keeps `ReadyFrameContext` lean
 * (one shape, one rationale) and lets us add a new renderer to the
 * dep bag without rewriting the frame-context derivation.
 */

import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { PassDeps } from './PassDeps';

/**
 * One discrete draw operation in the per-frame HDR render flow.
 *
 * `enabled` is the gate predicate: a pure read of state + ctx that
 * returns true when the pass should run this frame.  Tests can call
 * it directly with stub state to assert the gate logic without
 * standing up a GPU device.
 *
 * `draw` records draw commands into the supplied HDR pass encoder.
 * Pre-condition: `enabled(...)` returned `true`.  The function MUST
 * NOT call `pass.end()` — the encoder lifetime is owned by
 * `renderFrame`, which ends the pass once the for-loop completes.
 *
 * Argument order is `(pass, ctx, state, deps)` — the GPU encoder
 * first because every implementation needs it, then the derived
 * per-frame snapshot, then engine state, then the catch-all renderer
 * dep bag.  All settings are read directly from `state.settings.*`.
 */
export type Pass = {
  /**
   * Stable identifier for debugging and test assertions.  Kebab-
   * case by convention (matches the implicit naming in the existing
   * `renderFrame` block comments — `'point-sprites'`, `'milky-way'`,
   * etc.).
   */
  readonly name: string;
  /**
   * Whether this pass should record draw commands this frame.
   * Pure: no side effects.  Reads only from arguments.
   */
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  /**
   * Issue draw calls into the open HDR render pass.  Called only
   * when `enabled` returned `true`.  Must not call `pass.end()`.
   */
  draw(
    pass: GPURenderPassEncoder,
    ctx: ReadyFrameContext,
    state: EngineState,
    deps: PassDeps,
  ): void;
};
