/**
 * biasCorrectionSubsystem — owns the engine's Malmquist-bias correction
 * mode flags, cached per-source ratios/weights, the async bake state
 * machine, and the worker-runner registry.
 *
 * This state machine has no rendering reason to live on `GalaxyPointRenderer`;
 * keeping it in a sibling subsystem leaves the renderer as a clean
 * instanced-billboard drawer.  The split is uni-directional — the
 * renderer doesn't observe the subsystem; the subsystem reaches in via
 * the renderer's callback setters and splice methods.
 *
 * ### Why a closure-returning factory rather than a class?
 *
 * Same rationale every other subsystem under this folder uses
 * (thumbnailSubsystem, etc.):
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
 * generation no longer equals `generation`.  Same shape as `AssetSlot`'s
 * tier-swap generation counter.  The `fast_toggle_race` test is the
 * regression-suite anchor.
 *
 * ### Why the renderer ref is null at construction
 *
 * The subsystem is constructed eagerly in the engine state literal
 * (alongside `selection`, `tweens`, `scheduler`) — at that point the
 * GPU device hasn't been acquired yet, so `state.gpu.galaxyPointRenderer` is
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
 * The "no-op when no renderer" pre-attach behaviour is what eager
 * construction requires: any consumer capturing
 * `state.subsystems.biasCorrection` from t=0 onwards gets the live
 * subsystem.
 *
 * ### Why the worker runner is a factory parameter
 *
 * Test injection.  The alternative — a mutable static setter on the
 * subsystem or renderer — is a global smell and hangs an injection
 * seam off a surface that isn't its concern.  As a factory parameter,
 * tests pass an in-process stub at construction; production omits
 * the param and gets the default Vite `?worker` runner declared as
 * `defaultSchechterRunner` / `defaultAngularRunner` in this module.
 *
 * ### Why `state.settings.bias.mode` stays separate
 *
 * The subsystem mirrors `state.settings.bias.mode` internally (`mode`
 * field here) but doesn't own it.  The UI-facing knob bag stays on
 * `EngineState` so every reader (URL hash, InfoCard, SettingsPanel
 * echo) reads the one canonical place.
 *
 * ### Wake contract
 *
 * `setMode` wakes the scheduler on entry (so the shader's mode gate flips next
 * frame, including for the identity modes that fire no bake).  Every per-source
 * bake then wakes the loop AT ITS SPLICE SITE — `bakeSchechterFor` /
 * `bakeAngularFor` call `requestRender()` right after splicing into the vertex
 * buffer.  The wake lives there, not in `setMode`'s post-`Promise.all`, because
 * the same splice is reached by `onSourceUploaded` (a re-bake when a source
 * uploads while a bias mode is active — the boot path, since `AngularReweight`
 * is the default mode).  A wake only in `setMode` left that path stranded: the
 * reweight spliced into the GPU buffer but the render-on-demand loop, asleep
 * after the boot fade-in, never redrew it until the next unrelated input.
 * Callers need no trailing `requestRender()`.
 *
 * ### Production wiring
 *
 * The reconcile saga drives bake state via the bias.mode reconcile row.
 * The renderer reads `state.settings.bias.mode` per-frame for the
 * uniform write; this subsystem owns the splice pipeline that lays
 * per-galaxy ratios/weights into the per-source vertex buffers.
 *
 * @module
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { BiasMode } from '../../../data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../../@types/data/galaxyCatalog/BiasMode';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import type { ComputeSchechterRatiosInput } from '../../../@types/engine/ComputeSchechterRatiosInput';
import type { ComputeAngularWeightsInput } from '../../../@types/engine/ComputeAngularWeightsInput';
import type { SchechterRunner } from '../../../@types/engine/subsystems/SchechterRunner';
import type { AngularRunner } from '../../../@types/engine/subsystems/AngularRunner';
import type { BiasCorrectionSubsystem } from '../../../@types/engine/subsystems/BiasCorrectionSubsystem';
import type { BiasCorrectionDeps } from '../../../@types/engine/subsystems/BiasCorrectionDeps';
import type { GalaxyPointRenderer } from '../../../@types/rendering/GalaxyPointRenderer';
import type { SourceType } from '../../../@types/data/SourceType';

// `?worker` is a Vite-specific import suffix.  It instructs the bundler
// to emit each `.worker.ts` file as its own worker chunk and hand back a
// default-exported class whose `new`-instantiation spawns a Worker
// running that bundle.  The imports live here alongside the bake state
// machine so the renderer owns rendering and only rendering.
//
// In Node-only test environments the `?worker` suffix isn't resolvable;
// tests inject a synchronous fallback via the factory's optional
// `schechterRunner` / `angularRunner` parameters instead of importing
// this module's defaults.
import ComputeSchechterRatiosWorker from '../bake/computeSchechterRatios.worker?worker';
import ComputeAngularWeightsWorker from '../bake/computeAngularWeights.worker?worker';
import { cloneGalaxyCatalogForTransfer } from '../../../data/galaxyCatalog/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';

/**
 * Production default for the lazy Schechter-ratio bake — spawns a fresh
 * `?worker` chunk per call, ships a copied (slice-then-transfer) cloud,
 * waits for the resulting `Float32Array`, and terminates the worker.
 *
 * ### Why one worker per call?
 *
 * Parallel galaxy catalog fetches resolve in unpredictable order, so SDSS can
 * finish baking while 2MRS is mid-bake.  A long-lived worker would have
 * to queue requests internally; a per-call worker has zero shared
 * state and the OS-level concurrency happens automatically.  Worker
 * spawn is cheap (a few ms) compared to the 1–2 s bake itself.
 *
 * ### Why slice-then-transfer
 *
 * The engine retains the original `GalaxyCatalog` for picker / InfoCard
 * reads after the bake is kicked off — we cannot detach those buffers
 * in place via `Transferable[]`.  `slice(0)` mints owned copies whose
 * underlying ArrayBuffers we *can* transfer, leaving the engine's
 * authoritative cloud completely intact.  Cost: ~50 ms memcpy at full
 * deck — versus a multi-second structured clone if the buffers were
 * shipped without a transfer list.
 */
function defaultSchechterRunner(input: ComputeSchechterRatiosInput): Promise<Float32Array> {
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<ComputeSchechterRatiosInput, Float32Array>(
    ComputeSchechterRatiosWorker,
    { ...input, cloud: copy },
    transfer,
    'schechter-ratio',
  );
}

/**
 * Production default for the lazy HEALPix angular-reweight bake.
 * Mirror of `defaultSchechterRunner` — same per-call worker spawn,
 * same slice-then-transfer ownership pattern, same termination on
 * resolve/error.  See that function's docstring for the full rationale.
 *
 * The bake itself is three linear passes through the cloud's positions
 * plus a per-shell median sort; ~100-300 ms at full deck.  Worker spawn
 * (~few ms) is the right trade-off — even though the bake isn't as
 * dramatically expensive as the Schechter integral, dropping a frame
 * on mode toggle would feel sluggish.
 */
function defaultAngularRunner(input: ComputeAngularWeightsInput): Promise<Float32Array> {
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<ComputeAngularWeightsInput, Float32Array>(
    ComputeAngularWeightsWorker,
    { ...input, cloud: copy },
    transfer,
    'angular-weights',
  );
}

export function createBiasCorrectionSubsystem(deps: BiasCorrectionDeps): BiasCorrectionSubsystem {
  const { getMode, getLoadedClouds, requestRender } = deps;
  const schechterRunner: SchechterRunner = deps.schechterRunner ?? defaultSchechterRunner;
  const angularRunner: AngularRunner = deps.angularRunner ?? defaultAngularRunner;

  // Internal mutable state.  Closure-captured `let`s so they're
  // genuinely inaccessible from outside (no `this.mode` for a future
  // caller to reach in and poke).
  let renderer: GalaxyPointRenderer | null = null;
  // Initialise from the live state at first read time, not at
  // construction (the engine state literal hasn't been assigned to its
  // variable when `createBiasCorrectionSubsystem` is called from inside
  // it).  Lazy init also doubles as a trivial sync between
  // `state.settings.bias.mode` and our internal `mode` mirror at startup.
  let mode: BiasModeT | null = null;
  const cachedSchechter = new Map<SourceType, Float32Array>();
  const cachedAngular = new Map<SourceType, Float32Array>();
  /**
   * Generation counter — incremented on every `setMode`.  Each per-source
   * bake captures the generation at start and drops its result if the
   * captured generation no longer matches `generation` on resolve.  This
   * is the structural fix for the fast-toggle race; mirrors AssetSlot's
   * tier-swap race counter.
   */
  let generation = 0;

  /** Lazily read & memoize the current internal mode mirror. */
  function currentMode(): BiasModeT {
    if (mode === null) {
      mode = getMode();
    }
    return mode;
  }

  /** Snapshot every loaded `(source, catalog)` from the engine state. */
  function loadedSourceCatalogPairs(): { source: SourceType; catalog: GalaxyCatalog }[] {
    const out: { source: SourceType; catalog: GalaxyCatalog }[] = [];
    const catalogs = getLoadedClouds();
    for (const source of GALAXY_CATALOG_SOURCES) {
      const catalog = catalogs.get(source);
      if (catalog && catalog.count > 0) {
        out.push({ source, catalog });
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
    source: SourceType,
    cloud: GalaxyCatalog,
    myGen: number,
  ): Promise<void> {
    const ratios = await schechterRunner({ cloud, source });
    if (myGen !== generation) return; // stale — superseded by a newer setMode
    cachedSchechter.set(source, ratios);
    // If the renderer is attached, splice immediately AND wake the loop.  The
    // bake is async, so by the time it resolves the render-on-demand loop may
    // have gone to sleep (the boot fade-in already settled).  The splice mutates
    // the per-source vertex buffer, so without a wake the reweight sits in the
    // GPU buffer unshown until the next unrelated input — the AngularReweight-
    // on-boot "galaxies dim on first mouse move" strand.  The wake is at the
    // splice site so it covers BOTH callers (setMode's bake AND the
    // onSourceUploaded re-bake), not just the manual mode toggle.  If no
    // renderer is attached yet, the cached entry splices on attachRenderer
    // instead — no wake here, the bootstrap loop is starting anyway.
    if (renderer) {
      renderer.spliceSchechterRatios(source, ratios);
      requestRender();
    }
  }

  async function bakeAngularFor(
    source: SourceType,
    cloud: GalaxyCatalog,
    myGen: number,
  ): Promise<void> {
    const weights = await angularRunner({ cloud, source });
    if (myGen !== generation) return;
    cachedAngular.set(source, weights);
    // See bakeSchechterFor: wake at the splice site so an onSourceUploaded
    // re-bake (the boot path, AngularReweight being the default mode) isn't
    // stranded in the GPU buffer until the next input.
    if (renderer) {
      renderer.spliceAngularWeights(source, weights);
      requestRender();
    }
  }

  async function setMode(next: BiasModeT): Promise<void> {
    generation += 1;
    const myGen = generation;
    mode = next;
    // Entry wake — flips the mode gate next frame; the only wake identity
    // modes need (bake modes wake again post-splice below). Redundant today
    // with the settings route (setBiasMode → watchWakeSaga); kept because
    // setMode dispatches nothing itself, so covering that route is the
    // caller's job, not this function's (D8).
    requestRender();

    if (next === BiasMode.None || next === BiasMode.VolumeLimited || next === BiasMode.VMax) {
      // Identity-only modes.  The shader's gate ignores the per-galaxy
      // slot, so the slot's value is irrelevant — but we clear for
      // diagnostic cleanliness (a future debug overlay can recognise
      // 0.0 as "not active").  No bake, so this resolves synchronously.
      renderer?.clearBiasOverlays();
      return;
    }

    const pairs = loadedSourceCatalogPairs();

    if (next === BiasMode.Schechter) {
      // Per-source independence: each bake is a separate Promise, splice
      // fires when each resolves.  Tests assert this ordering invariant
      // via the multi_source_completion_ordering case.  No post-Promise.all
      // wake: each bakeSchechterFor wakes the loop at its own splice site, so a
      // trailing wake here would be redundant (and the same per-splice wake is
      // what fixes the onSourceUploaded re-bake path — #render-wake).
      await Promise.all(
        pairs.map(({ source, catalog }) => bakeSchechterFor(source, catalog, myGen)),
      );
      return;
    }

    if (next === BiasMode.AngularReweight) {
      await Promise.all(pairs.map(({ source, catalog }) => bakeAngularFor(source, catalog, myGen)));
      return;
    }
  }

  function onSourceUploaded(source: SourceType, cloud: GalaxyCatalog): void {
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

  function onSourceUnloaded(source: SourceType): void {
    cachedSchechter.delete(source);
    cachedAngular.delete(source);
  }

  function attachRenderer(r: GalaxyPointRenderer): void {
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

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the bias-correction subsystem
  // is one of the engine's ~13 teardown targets, and the shared shape
  // lets engine.destroy() iterate uniformly across the bag.
  const subsystem: BiasCorrectionSubsystem = {
    attachRenderer,
    setMode,
    onSourceUploaded,
    onSourceUnloaded,
    state: () => ({
      mode: currentMode(),
      sourcesWithSchechter: Array.from(cachedSchechter.keys()),
      sourcesWithAngular: Array.from(cachedAngular.keys()),
    }),
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
