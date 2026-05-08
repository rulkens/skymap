/**
 * engineReady — the canonical "has the engine bootstrapped?" predicate.
 *
 * ### What this is
 *
 * Pre-D.4, the codebase asked the question "did `initGpu` / `wireSlots` /
 * `wireInput` finish?" in five different shapes:
 *
 *   - `runFrame.ts` had a 5-way `||` chain across `state.cam`,
 *     `state.gpu.renderer`, `state.gpu.postProcess`,
 *     `state.gpu.pickRenderer`, and `state.subsystems.thumbnails`
 *     (later consolidated by D.1's `FrameContext`, but minus
 *     `pickRenderer`).
 *   - `runFrame.ts`'s "still-animating" predicate at the end of the
 *     frame body re-spelled out three of the same fields with
 *     bespoke `!== null && …` clauses.
 *   - `wiring/pointSourceRegistry.ts` had a single-field
 *     `if (!state.gpu.renderer) return;` skip in the slot-commit step
 *     — but that single field was a stand-in for "the engine bag is
 *     ready"; the destroy() path nulls all five together, so any
 *     one of them being null implies the others.
 *   - `runFrame.ts`'s pick branch used a `state.gpu.pickRenderer!`
 *     non-null assertion, gambling on the surrounding `ctx.isReady`
 *     check having already proven it.
 *
 * Each of those sites carried implicit knowledge: "we're past
 * bootstrap, so this handle is non-null."  But TypeScript couldn't
 * verify the implication — the `!` operators were folkloric, and
 * adding a new bootstrap-only field (e.g. a label renderer from the
 * forthcoming MSDF-labels work) meant grepping for every site that
 * re-spelled the question and updating each one.
 *
 * `isEngineReady` collapses all of that into one predicate with a
 * `state is ReadyEngineState` type guard.  Callers narrow once,
 * tsc carries the narrowing across the rest of the function, and
 * the bag of "must-be-non-null-after-bootstrap" handles is enumerated
 * exactly once.
 *
 * ### Why `filamentRenderer` is excluded
 *
 * `state.gpu.filamentRenderer` is `null` whenever `filaments.bin` is
 * absent — which is a supported deployment configuration (the
 * cosmic-web skeleton ships separately from the catalog point
 * clouds).  Including it in the bootstrap-complete bag would force
 * every consumer that calls `isEngineReady` to also imply "filaments
 * loaded", which would silently break the no-filaments path the
 * minute the engine tried to render before the optional bin loads.
 *
 * The few sites that genuinely need a populated filament renderer
 * (the still-animating predicate's `isFading()` check, the
 * filament-pass `enabled()` gate, the slot-commit's `upload()`)
 * already null-check `state.gpu.filamentRenderer` independently.
 * That's the right shape: optional resources null-check at the
 * point of use, not at the bootstrap gate.
 *
 * ### Why `pickRenderer` IS included
 *
 * Unlike `filamentRenderer`, `pickRenderer`'s lifecycle matches the
 * other four handles: it's constructed in `phases/wireInput.ts`
 * during the bootstrap IIFE and torn down in `destroy()` alongside
 * `renderer`, `postProcess`, and `thumbnails`.  Either all five are
 * present or none are — there is no "engine ran but pickRenderer
 * isn't built" state by design.  Including it here lets the per-frame
 * pick branch drop its `state.gpu.pickRenderer!` non-null assertion.
 *
 * ### Why this is named `isEngineReady`
 *
 * `isBootstrapped(state)` was the brainstorm's first try; rejected
 * because "bootstrapped" is process-vocabulary (compilation, server
 * boot) that doesn't tell a reader *what* finished.  `isReady(state)`
 * is too generic — ready for what?  `isEngineReady(state)` reads
 * crisply at every call site:
 *
 *   if (!isEngineReady(state)) return;     // narrows `state`
 *   state.gpu.renderer.upload(...);        // type-safe; no `!`
 *
 * The verb framing also pairs nicely with the `FrameContext.isReady`
 * boolean from D.1 — both ask the same question at different layers
 * (one at the per-frame snapshot level, one at the raw `EngineState`
 * level).
 *
 * ### Why intersection narrowing instead of rewriting `EngineState`
 *
 * The brainstorm considered making every nullable field on
 * `EngineState` non-null via lazy-init accessors, eliminating the
 * predicate entirely.  Rejected: the lift was too big, and it
 * breaks the "EngineState is the runtime data shape" invariant
 * documented in `EngineState.d.ts`.  The simpler path — keep the
 * canonical type as-is, build a `ReadyEngineState` via TypeScript
 * intersection, narrow via a `state is ReadyEngineState` guard —
 * lands without touching any existing type declaration.
 */

import type { EngineState, OrbitCamera } from '../../../@types';
import type { PointRenderer } from '../../gpu/renderers/pointRenderer';
import type { PostProcess } from '../../gpu/passes/postProcess';
import type { createPickRenderer } from '../../gpu/renderers/pickRenderer';
import type { ThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';

/**
 * The `EngineState` shape after `isEngineReady` returns `true`.
 *
 * Every field listed here is one whose pre-bootstrap value is `null`
 * and whose post-bootstrap value is the genuinely-required handle.
 * Built via TypeScript intersection (`EngineState & { ... }`) so the
 * canonical `EngineState` declaration stays untouched — the narrowing
 * is purely an additive overlay on top of the existing shape.
 *
 * Excluded: `state.gpu.filamentRenderer`.  See the module header for
 * the deployment-path rationale.
 */
export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    renderer: PointRenderer;
    pickRenderer: ReturnType<typeof createPickRenderer>;
    postProcess: PostProcess;
  };
  subsystems: EngineState['subsystems'] & {
    thumbnails: ThumbnailSubsystem;
  };
};

/**
 * Predicate: `true` iff the four bootstrap phases (`initGpu`,
 * `wireSlots`, `wireInput`, `startLoop`) have all written their
 * handles onto `state`.  Use everywhere a per-frame body, slot-commit
 * subscriber, or public-handle method needs to know "did the bootstrap
 * finish?".
 *
 * The `state is ReadyEngineState` return type makes the call site
 * narrow `state`'s field types automatically — no `!` non-null
 * assertions needed in the guarded block:
 *
 *   if (!isEngineReady(state)) return;
 *   state.gpu.renderer.draw(...);  // tsc proves `renderer` is non-null
 *
 * Implementation is a plain conjunction: branch prediction makes the
 * per-frame cost negligible.  The win is at the source-readability
 * and refactor-safety level, not runtime.
 */
export function isEngineReady(state: EngineState): state is ReadyEngineState {
  return (
    state.cam !== null &&
    state.gpu.renderer !== null &&
    state.gpu.pickRenderer !== null &&
    state.gpu.postProcess !== null &&
    state.subsystems.thumbnails !== null
  );
}
