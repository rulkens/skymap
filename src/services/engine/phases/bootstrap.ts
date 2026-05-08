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
 *   2. *Slot wiring.*  Per-source point-cloud slots (via the
 *      `POINT_SOURCE_REGISTRY` declarative table from Phase 4) plus three
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
 *   - the createEngine-scope helpers (`cssToTexPx`, `setHovered`,
 *     `setSelected`, `updateScaleBar`) that close over per-engine
 *     dedup state and so can't sit on `EngineState`;
 *   - `fpsCounter`, `lastReportedFps`, `milkyWayITimeEpochMs` — needed
 *     by `startLoop` to build the `RunFrameDeps` bag;
 *   - `allSlots` — the flat slot Map that `engine.ts` exposes via the
 *     public handle's `assetSlots` field; populated by `wireSlots`
 *     once every slot has been minted;
 *   - `handleRef` — the public handle is constructed AFTER the IIFE
 *     today, but `wireInput`'s onDoubleClick handler calls
 *     `handle.focusOn(lastClickedInfo)`.  A `{current}` ref carries the
 *     handle reference forward; engine.ts assigns it after the handle
 *     literal evaluates.
 */

import type { EngineCallbacks, EngineHandle, EngineState, PointInfo } from '../../../@types';
import type { Source } from '../../../data/sources';
import type { AssetSlot } from '../../loading/types';
import type { FpsCounter } from '../subsystems/fpsCounter';

import { initGpu, type PhaseLocals } from './initGpu';
import { wireSlots } from './wireSlots';
import { wireInput } from './wireInput';
import { startLoop } from './startLoop';

/**
 * Shared phase signature.  Every phase reads from + writes to `state`
 * and may consume any of the closure-captured locals threaded through
 * `deps`.  Phases run in declared order via `runBootstrapPhases` below;
 * they never call each other directly.
 */
export type Phase = (state: EngineState, deps: BootstrapDeps) => Promise<void>;

/**
 * Closure captures the bootstrap phases rely on.  Every entry was a
 * free reference in the original `engine.ts` IIFE; the survey done in
 * Phase 5 Task 5.1 enumerated each one and confirmed read-only vs.
 * mutated.  Mutated bindings (`frame`, `detachControls`, `handle`) are
 * boxed as `{current}` refs so writes round-trip back into createEngine's
 * outer scope across the module boundary.
 */
export type BootstrapDeps = {
  /** createEngine arg — for resize, viewport reads, listener attach. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — UI-callback sink. */
  cb: EngineCallbacks;

  /**
   * Mutable: forward-declared `frame` binding from `engine.ts`.  The
   * scheduler in `state.subsystems.scheduler` was wired with
   * `onFrame: () => frameRef.current()` so this assignment in
   * `startLoop` makes every subsequent rAF tick run the real body.
   * Boxed as `{current}` so the write round-trips back across the
   * module boundary — see Phase 3's `lastReportedFps` for the same
   * pattern.
   */
  frameRef: { current: () => void };

  /**
   * Mutable: orbit-controls detach handle.  `wireInput` writes the
   * detach function returned by `attachOrbitControls`; `engine.ts`'s
   * `destroy()` reads `detachControlsRef.current?.()` to remove the
   * listeners.  Boxed for the same write-across-modules reason as
   * `frameRef`.
   */
  detachControlsRef: { current: (() => void) | null };

  /**
   * Mutable: the public `EngineHandle`.  The handle literal is
   * evaluated AFTER the bootstrap IIFE in `engine.ts` (it captures
   * helpers that close over `state`), but `wireInput`'s onDoubleClick
   * handler calls `handle.focusOn(lastClickedInfo)`.  We thread the
   * reference through a `{current}` ref so engine.ts can assign it
   * after the handle literal evaluates — by the time the user can
   * actually double-click, the handle is fully wired.  Null until
   * engine.ts sets it.
   */
  handleRef: { current: EngineHandle | null };

  /**
   * Flat slot registry, keyed by `slot.name`.  `wireSlots` populates
   * it as each slot is minted; the public handle exposes the same
   * Map as `assetSlots` for the `LoadingDevPanel` debug component.
   * Same instance is also handed to `createLoadProgressEmitter` so
   * the loading bar and the dev panel agree byte-for-byte on what's
   * "in flight".  See engine.ts's outer-scope declaration for the
   * full lifecycle rationale.
   */
  allSlots: Map<string, AssetSlot<unknown, unknown>>;

  /** Rolling 60-frame counter; threaded through to `startLoop`'s `RunFrameDeps`. */
  fpsCounter: FpsCounter;

  /**
   * Mutable: last integer fps value reported via `cb.onFpsChange`.
   * Threaded through to `startLoop`'s `RunFrameDeps` (the frame body
   * reads + writes it).  Boxed as `{current}` — see Phase 3.
   */
  lastReportedFps: { current: number | null };

  /**
   * Wall-clock epoch (ms) snapshot taken at engine construction.
   * Threaded through to `startLoop`'s `RunFrameDeps` so the Milky
   * Way impostor's iTime is computed against a stable origin.
   */
  milkyWayITimeEpochMs: number;

  /** CSS-pixel → texture-space-pixel conversion (DPR-aware). */
  cssToTexPx: (cssPx: number) => number;

  /**
   * Notify the UI that the hovered point changed.  Closes over
   * `state.picking.hovered`, `cb.onHoverChange`, and the
   * `pointInfoForSelection` helper inside createEngine.
   */
  setHovered: (sel: { source: Source; localIdx: number } | null) => void;

  /**
   * Update the live selection.  Closes over the same dedup helpers
   * as `setHovered`, plus the optional `prebuiltInfo` short-circuit
   * for the `selectByAlias` pre-GPU-upload window.
   */
  setSelected: (
    sel: { source: Source; localIdx: number } | null,
    prebuiltInfo?: PointInfo | null,
  ) => void;

  /**
   * Refresh the scale-bar legend.  Internally dedups via a
   * closure-captured `lastScaleSig` so an unchanged label costs ~zero
   * per frame.
   */
  updateScaleBar: () => void;

  /**
   * Phase-local carrier for IIFE-scoped renderers/handles that survive
   * past `initGpu` but don't belong on `EngineState`.  Written by
   * `initGpu`; read by `wireSlots` and `startLoop`.  Undefined until
   * `initGpu` runs; the type asserts non-null at the read sites since
   * the orchestrator's order guarantees `initGpu` has completed by
   * then.  See `initGpu.ts`'s `PhaseLocals` for the contents and the
   * rationale on not promoting these to `EngineState`.
   */
  phaseLocals?: PhaseLocals;
};

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
 *   2. `wireSlots` runs second; it commits clouds into the renderer
 *      and starts the parallel fetches.  It awaits the all-arrivals
 *      gate before returning — the bbox loop in `wireInput` needs at
 *      least one cloud to size the camera.
 *   3. `wireInput` runs third; it reads `state.sources.clouds` (now
 *      populated) to compute the bbox + initial camera, then attaches
 *      orbit controls + click handlers + input bindings.
 *   4. `startLoop` runs last; it builds the `RunFrameDeps` bag (which
 *      needs every renderer + helper from the prior phases) and
 *      assigns the forward-declared `frame` binding.
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
