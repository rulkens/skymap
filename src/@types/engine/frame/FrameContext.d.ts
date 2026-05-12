/**
 * FrameContext — discriminated union of "ready" / "not ready" per-frame
 * snapshots produced by `deriveFrameContext`.
 *
 * ### Why the discriminated union (isReady: true | false)
 *
 * The alternative is `FrameContext | null` — a nullable shape where the
 * caller writes `if (!ctx) return`.  That works structurally, but the
 * named boolean reads better at every call site:
 *
 *   if (!ctx.isReady) {                  // self-describing
 *     state.subsystems.scheduler.requestRender();
 *     return;
 *   }
 *
 *   if (!ctx) return;                    // what does "not ctx" mean?
 *
 * The discriminated union also lets future contributors define helper
 * functions whose argument type is `ReadyFrameContext` instead of
 * `FrameContext`, encoding "this code only runs after the bootstrap
 * gate passed" directly in the type system.  Spec D's later migrations
 * (the `Pass` abstraction, D.2) lean on this — `Pass.draw` takes
 * `ReadyFrameContext`, so the type checker proves the engine was ready
 * when the pass fired without re-asserting the precondition.
 */

import type { NotReadyFrameContext } from './NotReadyFrameContext';
import type { ReadyFrameContext } from './ReadyFrameContext';

/** Discriminated union — narrow to `ReadyFrameContext` via `ctx.isReady`. */
export type FrameContext = ReadyFrameContext | NotReadyFrameContext;
