/**
 * biasCorrectionSubsystem — owns the engine's Malmquist-bias correction
 * mode flags, cached per-source ratios/weights, the async bake state
 * machine, and the worker-runner registry.
 *
 * Pre-Spec-E this state machine lived inside `PointRenderer` (~400 lines
 * of code that had no rendering reason to be on the renderer).  Spec E
 * extracts it into a sibling subsystem under `services/engine/subsystems/`,
 * leaving the renderer as a clean instanced-billboard drawer.  See the
 * spec for the full design rationale (uni-directional split, "renderer
 * doesn't observe subsystem"), the *Race behaviour — preserve exactly*
 * section for the three named races this subsystem must handle, and the
 * *Subsystem shape* section for the public API.
 *
 * ### Why a closure-returning factory rather than a class?
 *
 * Same rationale every other subsystem under this folder uses
 * (selectionSubsystem, thumbnailSubsystem, spaceMouseSubsystem):
 * the codebase's convention is "factories return typed handles, not
 * class instances", the internal mutable state (renderer ref, mode,
 * cache maps, generation counter) is genuinely inaccessible from
 * outside (no `this.mode` to reach in and poke), and the per-engine
 * cost is irrelevant — there's exactly one engine per page.
 *
 * ### Race handling via a generation counter
 *
 * Each `setMode` increments `generation`.  Each per-source bake captures
 * the generation at start; on resolve, drops the result if the captured
 * generation no longer equals `generation`.  This is the same shape
 * Spec A's `AssetSlot` uses for tier-swap race fixes — proven correct
 * in production, transplanted here.  The `fast_toggle_race` test in the
 * test file is the regression-suite anchor for this fix.
 *
 * ### Why the renderer ref is null at construction
 *
 * The subsystem is constructed eagerly in the engine state literal
 * (alongside `selection`, `tweens`, `scheduler`) — at that point the
 * GPU device hasn't been acquired yet, so `state.gpu.renderer` is
 * null.  `attachRenderer(renderer)` is called from `phases/initGpu.ts`
 * once the renderer exists.  In the brief pre-attach window:
 *
 *   - `setMode(...)` runs the bakes anyway and stores the resolved
 *     ratios/weights in `cachedSchechter` / `cachedAngular`.  When
 *     `attachRenderer` lands, the cached results splice immediately
 *     so the next render frame sees them.
 *   - `onSourceUploaded(...)` no-ops — the renderer's upload callback
 *     can't have fired yet (the renderer doesn't exist).
 *
 * The "no-op when no renderer" pre-attach behaviour matches Spec A's
 * eager-construction rule: any consumer capturing
 * `state.subsystems.biasCorrection` from t=0 onwards gets the live
 * subsystem.
 *
 * ### Why the worker runner is a factory parameter
 *
 * Test injection.  Pre-Spec-E the runner was a `private static` on
 * `PointRenderer` mutated via `setSchechterRatioRunner(...)` — a
 * mutable global is a smell, and made the renderer's surface area
 * carry an injection seam that wasn't part of its rendering concern.
 * Spec E moves the seam onto this subsystem's factory parameter:
 * tests pass an in-process stub at construction; production omits
 * the param and gets the default Vite `?worker` runner (wired in
 * Spec E phase E.4 — DEFERRED in this run, so the default in E.3
 * is a loud throw to catch accidental fall-through).
 *
 * ### Why `state.bias.mode` stays separate
 *
 * The subsystem mirrors `state.bias.mode` internally (`mode` field
 * here) but doesn't own it.  The UI-facing knob bag stays on
 * `EngineState` — same role as `state.settings`.  See the spec's
 * *State* section for why we keep the two parallel: every existing
 * reader (URL hash, InfoCard, SettingsPanel echo) continues to work
 * unchanged.
 *
 * ### Production behaviour in E.3 — wired and IDLE
 *
 * E.3 wires the subsystem into `state.subsystems.biasCorrection` and
 * has `phases/initGpu.ts` call `attachRenderer(...)` — but the public
 * handle's `setBiasMode` STILL goes through `pointRenderer.setBiasMode`
 * (the old path).  The cut-over to call this subsystem happens in
 * Spec E phase E.4 (DEFERRED — pending visual smoke test).  The
 * subsystem is exercised by tests in E.3 but not by production calls.
 *
 * @module
 */

import type { EngineState, PointCloud } from '../../../@types';
import { BiasMode } from '../../../data/biasMode';
import { Source, ALL_SOURCES } from '../../../data/sources';
import type { ComputeSchechterRatiosInput } from '../bake/computeSchechterRatios';
import type { ComputeAngularWeightsInput } from '../bake/computeAngularWeights';
import type { PointRenderer } from '../../gpu/renderers/pointRenderer';

/** Async function from a Schechter bake input to per-galaxy ratios. */
export type SchechterRunner = (input: ComputeSchechterRatiosInput) => Promise<Float32Array>;

/** Async function from an angular bake input to per-galaxy weights. */
export type AngularRunner = (input: ComputeAngularWeightsInput) => Promise<Float32Array>;

export type BiasCorrectionDeps = {
  /**
   * Live accessor for the engine state, NOT a snapshot.  The subsystem
   * is constructed inside the engine state literal — at that moment the
   * literal hasn't finished being assigned to its variable, so we can't
   * pass `state` as a value.  Same closure-deps pattern `selection` uses
   * (see selectionSubsystem.ts module header for the rationale): the
   * subsystem reads the LIVE state at call time, not whatever was in
   * scope at construction.  This also matters across tier swaps —
   * `state.sources.clouds` is mutated in place; a snapshot would freeze
   * the state at engine-construction time.
   */
  getState: () => EngineState;
  /** Optional override; defaults to a loud throw until E.4 wires Vite `?worker`. */
  schechterRunner?: SchechterRunner;
  /** Optional override; defaults to a loud throw until E.4 wires Vite `?worker`. */
  angularRunner?: AngularRunner;
};

export type BiasCorrectionSubsystem = {
  /** Wire the renderer once it exists (during `phases/initGpu`). */
  attachRenderer(renderer: PointRenderer): void;
  /** Switch bias mode; fires bakes for every loaded source. */
  setMode(mode: BiasMode): Promise<void>;
  /** Called by the renderer when a source uploads or re-uploads. */
  onSourceUploaded(source: Source, cloud: PointCloud): void;
  /** Called by the renderer when a source unloads. */
  onSourceUnloaded(source: Source): void;
  /** Test-only: snapshot of internal state. */
  state(): {
    mode: BiasMode;
    sourcesWithSchechter: Source[];
    sourcesWithAngular: Source[];
  };
};

/**
 * Default runner for E.3 — throws if invoked without a test stub.
 *
 * The Vite `?worker` defaults still live on `PointRenderer` in E.3
 * because the public handle's `setBiasMode` continues to drive the
 * old path.  This subsystem is exercised only by tests in E.3, and
 * tests always inject explicit `schechterRunner` / `angularRunner`
 * stubs.  Spec E phase E.4 (DEFERRED) moves the production worker
 * defaults onto this module and replaces this throw — at that point
 * `createBiasCorrectionSubsystem({state})` (no overrides) just works.
 */
function defaultRunnerNotWired(): never {
  throw new Error(
    'biasCorrectionSubsystem: no default runner wired — pass schechterRunner/angularRunner ' +
      'in tests, or wait for Spec E phase E.4 to cut over from pointRenderer.setBiasMode.',
  );
}

export function createBiasCorrectionSubsystem(deps: BiasCorrectionDeps): BiasCorrectionSubsystem {
  const { getState } = deps;
  const schechterRunner: SchechterRunner = deps.schechterRunner ?? defaultRunnerNotWired;
  const angularRunner: AngularRunner = deps.angularRunner ?? defaultRunnerNotWired;

  // Internal mutable state.  Closure-captured `let`s so they're
  // genuinely inaccessible from outside (no `this.mode` for a future
  // caller to reach in and poke).
  let renderer: PointRenderer | null = null;
  // Initialise from the live state at first read time, not at
  // construction (the engine state literal hasn't been assigned to its
  // variable when `createBiasCorrectionSubsystem` is called from inside
  // it).  Lazy init also doubles as a trivial sync between
  // `state.bias.mode` and our internal `mode` mirror at startup.
  let mode: BiasMode | null = null;
  const cachedSchechter = new Map<Source, Float32Array>();
  const cachedAngular = new Map<Source, Float32Array>();
  /**
   * Generation counter — incremented on every `setMode`.  Each per-source
   * bake captures the generation at start and drops its result if the
   * captured generation no longer matches `generation` on resolve.  This
   * is the structural fix for the fast-toggle race documented in the
   * spec's R1 mitigation; mirrors AssetSlot's tier-swap race counter.
   */
  let generation = 0;

  /** Lazily read & memoize the current internal mode mirror. */
  function currentMode(): BiasMode {
    if (mode === null) {
      mode = getState().bias.mode;
    }
    return mode;
  }

  /** Snapshot every loaded `(source, cloud)` from the engine state. */
  function loadedSourceCloudPairs(): { source: Source; cloud: PointCloud }[] {
    const out: { source: Source; cloud: PointCloud }[] = [];
    const clouds = getState().sources.clouds;
    for (const source of ALL_SOURCES) {
      const cloud = clouds.get(source);
      if (cloud && cloud.count > 0) {
        out.push({ source, cloud });
      }
    }
    return out;
  }

  /**
   * Run a per-source Schechter bake.  Captures the generation at start;
   * on resolve, drops the result if a newer generation has started
   * (fast-toggle-race fix).  On race-pass: caches the ratios + (if
   * renderer attached) splices them immediately.
   */
  async function bakeSchechterFor(
    source: Source,
    cloud: PointCloud,
    myGen: number,
  ): Promise<void> {
    const ratios = await schechterRunner({ cloud, source });
    if (myGen !== generation) return; // stale — superseded by a newer setMode
    cachedSchechter.set(source, ratios);
    // If the renderer is attached, splice immediately.  If not yet
    // attached, the cached entry will splice on attachRenderer.
    renderer?.spliceSchechterRatios(source, ratios);
  }

  async function bakeAngularFor(
    source: Source,
    cloud: PointCloud,
    myGen: number,
  ): Promise<void> {
    const weights = await angularRunner({ cloud, source });
    if (myGen !== generation) return;
    cachedAngular.set(source, weights);
    renderer?.spliceAngularWeights(source, weights);
  }

  async function setMode(next: BiasMode): Promise<void> {
    generation += 1;
    const myGen = generation;
    mode = next;

    if (next === BiasMode.None || next === BiasMode.VolumeLimited || next === BiasMode.VMax) {
      // Identity-only modes.  The shader's gate ignores the per-galaxy
      // slot, so the slot's value is irrelevant — but we clear for
      // diagnostic cleanliness (a future debug overlay can recognise
      // 0.0 as "not active").  No bake, so this resolves synchronously.
      renderer?.clearBiasOverlays();
      return;
    }

    const pairs = loadedSourceCloudPairs();

    if (next === BiasMode.Schechter) {
      // Per-source independence: each bake is a separate Promise, splice
      // fires when each resolves.  Tests assert this ordering invariant
      // via the multi_source_completion_ordering case.
      await Promise.all(pairs.map(({ source, cloud }) => bakeSchechterFor(source, cloud, myGen)));
      // Wake the loop ONCE after every splice has landed.  If `myGen`
      // is stale (a newer setMode bumped it mid-Promise.all), skip the
      // wake — the newer setMode will fire its own.
      if (myGen === generation) {
        getState().subsystems.scheduler.requestRender();
      }
      return;
    }

    if (next === BiasMode.AngularReweight) {
      await Promise.all(pairs.map(({ source, cloud }) => bakeAngularFor(source, cloud, myGen)));
      if (myGen === generation) {
        getState().subsystems.scheduler.requestRender();
      }
      return;
    }
  }

  function onSourceUploaded(source: Source, cloud: PointCloud): void {
    // A re-upload invalidates any prior cache for this source.
    cachedSchechter.delete(source);
    cachedAngular.delete(source);

    // If a bias mode is active, fire a fresh per-source bake using
    // the current generation.  Same race-drop semantics as setMode.
    // The mid_bake_upload_race test asserts that this is a per-source
    // bake, NOT a re-bake-all (the original setMode's Promise.all is
    // independent and continues to resolve).
    const myGen = generation;
    const m = currentMode();
    if (m === BiasMode.Schechter) {
      void bakeSchechterFor(source, cloud, myGen);
    } else if (m === BiasMode.AngularReweight) {
      void bakeAngularFor(source, cloud, myGen);
    }
  }

  function onSourceUnloaded(source: Source): void {
    cachedSchechter.delete(source);
    cachedAngular.delete(source);
  }

  function attachRenderer(r: PointRenderer): void {
    renderer = r;
    // Install the upload/unload callbacks so the renderer can notify
    // us mid-mode when a source arrives/leaves.  Uni-directional
    // coupling — the renderer doesn't import or know about this
    // subsystem; the subsystem reaches in via these setters.
    r.setBiasUploadCallback((source, cloud) => onSourceUploaded(source, cloud));
    r.setBiasUnloadCallback((source) => onSourceUnloaded(source));
    // Apply any cached results that resolved before attach (the
    // attach_after_setMode_completes test).  Mode-coherent: only
    // splice the family that matches the current mode.
    const m = currentMode();
    if (m === BiasMode.Schechter) {
      for (const [source, ratios] of cachedSchechter) {
        r.spliceSchechterRatios(source, ratios);
      }
    } else if (m === BiasMode.AngularReweight) {
      for (const [source, weights] of cachedAngular) {
        r.spliceAngularWeights(source, weights);
      }
    }
  }

  return {
    attachRenderer,
    setMode,
    onSourceUploaded,
    onSourceUnloaded,
    state: () => ({
      mode: currentMode(),
      sourcesWithSchechter: Array.from(cachedSchechter.keys()),
      sourcesWithAngular: Array.from(cachedAngular.keys()),
    }),
  };
}
