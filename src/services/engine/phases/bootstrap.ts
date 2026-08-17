/**
 * bootstrap — orchestrator for the engine's async startup phases.
 *
 * ### Why phases
 *
 * The alternative is a single ~1100-line async IIFE whose top-down
 * reading interleaves four very different concerns:
 *
 *   1. *GPU init.*  Device acquisition, swap-chain format negotiation,
 *      every renderer constructor (point, pick, milky-way, filament,
 *      quad, disk, procedural-disk) and the HDR offscreen post-process.
 *   2. *Slot wiring.*  Per-source galaxy-catalog slots (via the
 *      `GALAXY_CATALOG_SOURCE_REGISTRY` declarative table) plus three
 *      sidecar slots (filaments, famous-galaxies-meta, pgc-aliases), the
 *      load-progress emitter, and the all-arrivals gate that the
 *      synthetic fallback is conditional on.
 *   3. *Input wiring.*  Pick renderer, click resolver, orbit camera
 *      construction (post-bbox), the orbit-controls attachment with its
 *      click / dblclick / camera-change handlers, the
 *      `inputBindings` pointer/keyboard listener bag, and the seed of
 *      settings callbacks so React mirrors the engine truth.
 *   4. *Loop start.*  Building the `RunFrameDeps` bag, assigning the
 *      forward-declared `frame` binding, and firing the first
 *      `scheduler.requestRender()` so a single rAF tick happens.
 *
 * Each concern has different inputs, different state writes, and
 * different consumers.  Four named phases in four small files with
 * docstrings turn "where does X live in the bootstrap?" from a
 * line-number lookup into a filename lookup.
 *
 * ### Why this orchestrator owns the try/catch
 *
 * Any thrown error is dispatched via `engineStatusChanged({ kind: 'error', … })`:
 * the `await` chain in `runBootstrapPhases` short-circuits on the
 * first rejection, and the call site in `engine.ts` keeps a single
 * try/catch around the orchestrator call.  Phases themselves don't
 * catch — they let errors propagate so the orchestrator's caller is
 * the single source of truth for the error path.
 *
 * ### Why state writes (not return values) carry data between phases
 *
 * Each phase mutates `state.*` as it runs, and later phases read the
 * freshly-mutated state (`initGpu` writes `state.gpu.galaxyPointRenderer`;
 * `wireSlots` reads it for the slot commit; etc.).  Each phase's
 * signature is `(state, deps) => Promise<void>` with no return value —
 * return-value plumbing would add a second inter-phase data channel
 * alongside the `state.*` reads the rest of the engine already does.
 *
 * ### What lives in `BootstrapDeps`
 *
 * Anything the IIFE captured from `createEngine`'s outer scope that
 * isn't already on `EngineState`.  That's:
 *
 *   - `canvas`, `cb` — createEngine arguments;
 *   - the `frameRef` and `detachControlsRef` boxes for the two
 *     forward-declared `let`s in `engine.ts` that later phases need to
 *     write to (round-trip via the `{current}` ref pattern).  The pure
 *     `cssToTexPx` helper is imported directly in `wireInput` (no
 *     per-engine dedup state).  Scale-bar
 *     derivation lives entirely React-side (driven by
 *     the frame loop's `engineScaleChanged` dispatch), so there's no engine-side scale-bar
 *     factory to thread.  Hover/select/focus dispatches go through the
 *     Redux store (the pick path calls `store.dispatch` directly);
 *   - `allSlots` — the flat slot Map that `engine.ts` exposes via the
 *     public handle's `assetSlots` field; populated by `wireSlots`
 *     once every slot has been minted;
 *   - `handleRef` — the public handle is constructed AFTER the
 *     bootstrap call, but `wireInput` reads it lazily. A `{current}`
 *     ref carries the handle reference forward; engine.ts assigns it
 *     after the handle literal evaluates.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

import { initGpu } from './initGpu';
import { wireSlots } from './wireSlots';
import { wireInput } from './wireInput';
import { startLoop } from './startLoop';

/**
 * Run the four bootstrap phases in declared order.  First rejection
 * short-circuits the chain.  The caller (engine.ts) wraps the call in
 * a try/catch and dispatches any thrown error via
 * `engineStatusChanged({ kind: 'error', … })`.
 *
 * Phase order is fixed by data dependencies:
 *   1. `initGpu` runs first because every later phase needs the
 *      device, the renderer, and the post-process.
 *   2. `wireSlots` runs second; it mints sidecar slots and kicks off
 *      the parallel fetches. It does NOT wait on arrivals — galaxy catalog
 *      commits land asynchronously via per-slot subscribers.
 *   3. `wireInput` runs third; it builds the orbit camera from pure
 *      constants (no bbox dependency) and attaches controls + click
 *      handlers + input bindings.
 *   4. `startLoop` runs last; it builds the `RunFrameDeps` bag and
 *      fires the first rAF. The Milky Way is visible from the first
 *      frame; galaxy catalogs fade in as their fetches resolve.
 *
 * State writes propagate via `state.*` mutation — each phase reads
 * from the freshly-written state of its predecessors.  Mutable
 * closure captures (`frame`, `detachControls`, `handle`) propagate
 * via the `{current}` ref boxes carried in `deps`.
 */
export async function runBootstrapPhases(state: EngineState, deps: BootstrapDeps): Promise<void> {
  await initGpu(state, deps);
  await wireSlots(state, deps);
  await wireInput(state, deps);
  await startLoop(state, deps);
}
