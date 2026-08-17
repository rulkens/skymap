/**
 * engineReady — the canonical "has the engine bootstrapped?" predicate.
 *
 * ### What this is
 *
 * Pre-D.4, the codebase asked the question "did `initGpu` / `wireSlots` /
 * `wireInput` finish?" in five different shapes:
 *
 *   - `runFrame.ts` had a 5-way `||` chain across `state.cam`,
 *     `state.gpu.galaxyPointRenderer`, `state.gpu.postProcess`,
 *     `state.gpu.galaxyPickRenderer`, and `state.subsystems.texturedDisks`
 *     (later consolidated by D.1's `FrameContext`, but minus
 *     `galaxyPickRenderer`).
 *   - `runFrame.ts`'s "still-animating" predicate at the end of the
 *     frame body re-spelled out three of the same fields with
 *     bespoke `!== null && …` clauses.
 *   - `wiring/galaxyCatalogSourceRegistry.ts` had a single-field
 *     `if (!state.gpu.galaxyPointRenderer) return;` skip in the slot-commit step
 *     — but that single field was a stand-in for "the engine bag is
 *     ready"; the destroy() path nulls all five together, so any
 *     one of them being null implies the others.
 *   - `runFrame.ts`'s pick branch used a `state.gpu.galaxyPickRenderer!`
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
 * ### Why `galaxyPickRenderer` IS included
 *
 * Unlike `filamentRenderer`, `galaxyPickRenderer`'s lifecycle matches the
 * other gate-included handles: it's constructed in `phases/wireInput.ts`
 * during the bootstrap IIFE and torn down in `destroy()` alongside
 * `galaxyPointRenderer`, `renderTargets`, and `texturedDisks`.
 * Either all gate-included handles are present or none are — there is
 * no "engine ran but galaxyPickRenderer isn't built" state by design.
 * Including it here lets the per-frame pick branch drop its
 * `state.gpu.galaxyPickRenderer!` non-null assertion.
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
 *   state.gpu.galaxyPointRenderer.upload(...);   // type-safe; no `!`
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

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyEngineState } from '../../../@types/engine/ReadyEngineState';

// ReadyEngineState moved to @types/engine/ReadyEngineState.d.ts.

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
 *   state.gpu.galaxyPointRenderer.draw(...);  // tsc proves `galaxyPointRenderer` is non-null
 *
 * Implementation is a plain conjunction: branch prediction makes the
 * per-frame cost negligible.  The win is at the source-readability
 * and refactor-safety level, not runtime.
 */
export function isEngineReady(state: EngineState): state is ReadyEngineState {
  return (
    state.cam !== null &&
    state.gpu.galaxyPointRenderer !== null &&
    state.gpu.galaxyPickRenderer !== null &&
    // `renderTargets` owns every offscreen row (`hdr`, `volume`) the frame
    // draws into — allocated in `initGpu`, torn down in `destroy()`. The
    // engine is never "ready" without it: every render step's `viewFor`
    // resolution would throw. One check replaces the pre-table pair of
    // per-target handle checks (`postProcess` + `volumeOffscreen`), which
    // always flipped together anyway.
    state.gpu.renderTargets !== null &&
    // `compositor` shares the bootstrap lifecycle of `renderTargets`: both
    // are minted in `initGpu` and torn down in `destroy()`. The FRAME
    // program's `hdr→swap` composite step calls `state.gpu.compositor.draw`,
    // so the frame must not run until the compositor exists — including it
    // here means `deriveFrameContext`'s ready gate covers it, and
    // `executeFrame`'s null guard becomes a wiring-bug backstop rather than
    // a per-frame concern.
    state.gpu.compositor !== null &&
    state.subsystems.texturedDisks !== null
  );
}
