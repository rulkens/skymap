/**
 * bootstrap — orchestrator for the engine's async startup phases.
 *
 * ### Why phases
 *
 * Pre-Phase-5 the engine's bootstrap was a single ~1100-line async IIFE
 * inside `engine.ts`.  Reading top-down it interleaved four very
 * different concerns:
 *
 *   1. *GPU init.*  Device acquisition, swap-chain format negotiation,
 *      every renderer constructor (point, pick, milky-way, filament,
 *      quad, disk, procedural-disk) and the HDR offscreen post-process.
 *   2. *Slot wiring.*  Per-source galaxy-catalog slots (via the
 *      `GALAXY_CATALOG_SOURCE_REGISTRY` declarative table from Phase 4) plus three
 *      sidecar slots (filaments, famous-meta, pgc-aliases), the
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
 * different consumers.  Splitting the IIFE into four named phases is
 * pure relocation — every section moves verbatim — but turning the
 * 1100-line undifferentiated try-block into four small files with
 * docstrings turns "where does X live in the bootstrap?" from a
 * line-number lookup into a filename lookup.
 *
 * ### Why this orchestrator owns the try/catch
 *
 * The pre-Phase-5 IIFE wrapped the whole body in one try/catch that
 * surfaced any thrown error via `cb.onStatusChange({ kind: 'error', … })`.
 * That contract is preserved here unchanged: the `await` chain in
 * `runBootstrapPhases` short-circuits on the first rejection, and the
 * call site in `engine.ts` keeps a single try/catch around the
 * orchestrator call.  Phases themselves don't catch — they let errors
 * propagate so the orchestrator's caller is the single source of truth
 * for the error path.
 *
 * ### Why state writes (not return values) carry data between phases
 *
 * The IIFE today mutates `state.*` as each section runs and reads from
 * the freshly-mutated state in later sections (`initGpu` writes
 * `state.gpu.renderer`; `wireSlots` reads it for the slot commit; etc.).
 * Phases preserve that pattern — each phase's signature is
 * `(state, deps) => Promise<void>` with no return value — so the diff
 * stays "lift verbatim, rewrite closure refs as `state.*`/`deps.*`".
 * Promoting any inter-phase data to return-value plumbing would be a
 * refactor beyond the relocation's scope.
 *
 * ### What lives in `BootstrapDeps`
 *
 * Anything the IIFE captured from `createEngine`'s outer scope that
 * isn't already on `EngineState`.  That's:
 *
 *   - `canvas`, `cb` — createEngine arguments;
 *   - the `frameRef` and `detachControlsRef` boxes for the two
 *     forward-declared `let`s in `engine.ts` that later phases need to
 *     write to (round-trip via the `{current}` ref pattern, same shape
 *     as `lastReportedFps` from Phase 3);
 *   - `fpsCounter`, `lastReportedFps` — needed by `startLoop` to build
 *     the `RunFrameDeps` bag.  The pure `cssToTexPx` helper and the
 *     `milkyWayITimeEpochMs` snapshot used to live here too, but
 *     post-extraction they're imported / snapshotted directly in
 *     `wireInput` / `startLoop` — there's no per-engine dedup state
 *     for `cssToTexPx`, and the iTime epoch is `performance.now()`
 *     taken once (the * 0.25 animation scale makes "engine
 *     construction" vs "loop start" imperceptible).  Scale-bar
 *     derivation lives entirely React-side now (driven by
 *     `cb.onCameraChange`), so there's no engine-side scale-bar
 *     factory to thread either.  `setHovered` / `setSelected`
 *     similarly don't appear: phases call into
 *     `state.subsystems.selection` directly (Spec D.3);
 *   - `allSlots` — the flat slot Map that `engine.ts` exposes via the
 *     public handle's `assetSlots` field; populated by `wireSlots`
 *     once every slot has been minted;
 *   - `handleRef` — the public handle is constructed AFTER the IIFE
 *     today, but `wireInput`'s onDoubleClick handler calls
 *     `handle.focusOn(lastClickedInfo)`.  A `{current}` ref carries the
 *     handle reference forward; engine.ts assigns it after the handle
 *     literal evaluates.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

import { initGpu } from './initGpu';
import { wireSlots } from './wireSlots';
import { wireInput } from './wireInput';
import { startLoop } from './startLoop';

/**
 * Run the four bootstrap phases in declared order.  First rejection
 * short-circuits the chain — same semantics as the pre-Phase-5
 * single-try/catch IIFE.  The caller (engine.ts) wraps the call in a
 * try/catch and surfaces any thrown error via
 * `cb.onStatusChange({ kind: 'error', … })`.
 *
 * Phase order is fixed by data dependencies:
 *   1. `initGpu` runs first because every later phase needs the
 *      device, the renderer, and the post-process.
 *   2. `wireSlots` runs second; it mints sidecar slots and kicks off
 *      the parallel fetches. It does NOT wait on arrivals — survey
 *      commits land asynchronously via per-slot subscribers.
 *   3. `wireInput` runs third; it builds the orbit camera from pure
 *      constants (no bbox dependency) and attaches controls + click
 *      handlers + input bindings.
 *   4. `startLoop` runs last; it builds the `RunFrameDeps` bag and
 *      fires the first rAF. The Milky Way is visible from the first
 *      frame; surveys fade in as their fetches resolve.
 *
 * State writes propagate via `state.*` mutation — each phase reads
 * from the freshly-written state of its predecessors.  Mutable
 * closure captures (`frame`, `detachControls`, `handle`) propagate
 * via the `{current}` ref boxes carried in `deps`.
 */
export async function runBootstrapPhases(
  state: EngineState,
  deps: BootstrapDeps,
): Promise<void> {
  await initGpu(state, deps);
  await wireSlots(state, deps);
  await wireInput(state, deps);
  await startLoop(state, deps);
}
