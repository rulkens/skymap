/**
 * Engine — the imperative WebGPU core, decoupled from any UI framework.
 *
 * This module is responsible for everything that touches the GPU, the camera,
 * and the raw browser input events. It knows nothing about React — it receives
 * simple callback functions and calls them when state changes.
 *
 * The boundary is deliberate:
 *
 *   Engine (engine.ts)            React (App.tsx, components/)
 *   ─────────────────────         ─────────────────────────────
 *   WebGPU device / buffers   ←→  status bar text
 *   requestAnimationFrame     ←→  info card fields
 *   pointer / keyboard events ←→  scale bar label + width
 *   orbit camera math
 *   GPU pick readback
 *
 * All observable engine state (lifecycle status, scale, source counts, load
 * progress, selection) is dispatched directly to the Redux store; React reads
 * via `useAppSelector` selectors. `EngineCallbacks` carries only the injected
 * `store` and `setSagaContext` — there are no event callback clusters.
 *
 * ### Module layout
 *
 * The pure / leaf concerns and the cohesive subsystems live in sibling
 * modules so this file can stay focused on the imperative orchestration:
 *
 *   Pure helpers:
 *   - `galaxyFocusDistance.ts` / `structureFocusDistance.ts` — framing-distance helpers
 *   - `buildGalaxyInfo.ts`     — buildGalaxyInfo (per-source GalaxyInfo formatter)
 *   - `cloudLoader.ts`         — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *   - `cameraFraming.ts`       — bbox + FOV → initial camera snapshot
 *   - `scaleBar.ts`            — pure scale-bar tick selection + label formatting (consumed by React)
 *
 *   Subsystems (closure-returning factories with internal state):
 *   - `clickHandler.ts`        — pick → globalIdx → GalaxyInfo resolver
 *   - `inputBindings.ts`       — pointer/keyboard/resize listener bag
 *   - `thumbnailSubsystem.ts`  — atlas + queue + per-frame thumbnail draw
 *
 *   Bootstrap phases (the async IIFE, lifted out of this file):
 *   - `phases/initGpu.ts`      — device + every renderer + point-source slots
 *   - `phases/wireSlots.ts`    — sidecar slots + thumbnails + parallel load
 *   - `phases/wireInput.ts`    — pickRenderer + camera + orbit-controls + click
 *   - `phases/startLoop.ts`    — RunFrameDeps assembly + first requestRender
 *   - `phases/bootstrap.ts`    — orchestrator + BootstrapDeps + Phase signature
 *
 * Hover/select/focus state lives in the Redux `selection` slice
 * (`state/selection/selectionSlice.ts`).  The public handle and the
 * forward-declared `frameRef` / `detachControlsRef` / `handleRef` boxes
 * stay inline here because the bootstrap phases (sibling modules) write
 * them via the `{current}` ref pattern.
 *
 * ### Usage
 *
 * ```ts
 * const handle = createEngine(canvas, { store, setSagaContext });
 *
 * // later (e.g. React cleanup):
 * handle.destroy();
 * ```
 */

import type { SourceType } from '../../@types/data/SourceType';
import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineState } from '../../@types/engine/state/EngineState';

import { createCameraClock } from './camera/cameraClock';
import type { CameraRuntime } from '../../@types/engine/state/CameraRuntime';
import { createEngineData } from './data/createEngineData';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createLabelDirectorSubsystem } from './subsystems/labelDirectorSubsystem';
import { produceMilkyWayLabel } from './presentation/produceMilkyWayLabel';
import { produceStructureLabels } from './presentation/produceStructureLabels';
import { produceFamousLabels } from './presentation/produceFamousLabels';
import { createStructureFocusSubsystem } from './subsystems/structureFocusSubsystem';
import { createClipPlayer } from './subsystems/clipPlayer';
import { createClipPathInspector } from './subsystems/clipPathInspector';
import { CONTENT_LAYERS } from './frame/passes';
import { logCameraState } from './helpers/logCameraState';
import { engineStatusChanged } from '../../state/engine/engineSlice';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../@types/loading/PgcAliasMap';
import type { RequestKey } from '../../@types/loading/RequestKey';
import { awaitSlotReady } from '../loading/awaitSlotReady';

import { runBootstrapPhases } from './phases/bootstrap';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';
import { addVolumeField } from './handles/addVolumeField';
import { removeVolumeField } from './handles/removeVolumeField';
import { listVolumeFields } from './handles/listVolumeFields';
import { getVolumeFieldsState } from './handles/getVolumeFieldsState';
import { makeRunTierTransition } from './wiring/makeRunTierTransition';
import { makeReconcileEffects } from './wiring/makeReconcileEffects';
import { createPlayClip } from './animation/playClip';
import { createClipPathInspectSeam } from './animation/computeClipPath';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';

/**
 * Start the WebGPU engine on `canvas`.
 *
 * Returns a handle synchronously; async setup (GPU init, data loading)
 * progresses in the background and is dispatched to the store via
 * `engineStatusChanged`.
 *
 * ### Lifecycle
 *
 *   1. `engineStatusChanged({ kind: 'initializing' })` dispatches immediately.
 *   2. `initGpu()` + `loadCloud()` run asynchronously.
 *   3. `engineStatusChanged({ kind: 'loading' })` dispatches before the fetch.
 *   4. `engineStatusChanged({ kind: 'ready', ... })` dispatches when the render
 *      loop starts, or `{ kind: 'error' }` if GPU init fails.
 *   5. `engineScaleChanged` dispatches per frame during steady-state rendering
 *      as the camera moves (deduped by the slice).
 *
 * @throws Never — errors are dispatched via `engineStatusChanged({ kind: 'error' })`.
 */

export function createEngine(canvas: HTMLCanvasElement, cb: EngineCallbacks): EngineHandle {
  // ── Mutable engine state ─────────────────────────────────────────────────
  //
  // Everything lives as closure variables rather than a class because the
  // engine is a singleton: one canvas → one engine → one set of state.
  // Closure variables are slightly simpler to reason about than `this.*` and
  // they keep the internal state completely inaccessible from outside.

  // The whole engine state — see `@types/EngineState.d.ts` (and the
  // per-sub-bag siblings) for the type-level map.  Sub-bag groupings:
  //
  //   - `settings`   → SettingsPanel knobs, seeded from `data/defaults.ts`
  //                    (the single source of truth shared with App.tsx).
  //   - `sources`    → loaded `GalaxyCatalog`s + visibility bitmasks + tier
  //                    + optional famous-galaxy sidecars.
  //   - `picking`    → hover / click / drag mutables.
  //   - `gpu`        → renderers / offscreen render-target table /
  //                    compositor — null until `initGpu` finishes.
  //   - `subsystems` → long-lived helpers; some construct up-front, the rest
  //                    land later.
  //   - `cam`        → orbit camera, null until the first cloud loads.
  //
  // The outer `state` binding is `const` — only inner fields mutate.
  // Mutation in place matches the subsystem facades and avoids per-frame
  // allocations on the hot path.

  // ── Frame-function forward declaration ────────────────────────────────────
  //
  // The render loop's `frame()` body lives in `runFrame.ts` (called from
  // the `startLoop` phase) because it reads GPU resources initGpu returns
  // asynchronously.  But the `RenderScheduler` in `state.subsystems.scheduler`
  // needs an `onFrame` callback at construction time — here, in the
  // synchronous state literal below.
  //
  // We resolve the chicken-and-egg with a `{ current }` ref holding a no-op
  // stub.  The scheduler captures `frameRef` via `() => frameRef.current()`,
  // so once `startLoop` assigns the real body, every rAF runs it.  A ref
  // (not a `let`) because the bootstrap phases are sibling modules where a
  // `let` would be invisible (see `BootstrapDeps` for the full ref inventory).
  //
  // The stub is a silent no-op: its only invocation window is "rAF fires
  // before startLoop wires `frameRef.current`", vanishingly rare and
  // harmless.
  const frameRef: { current: () => void } = {
    current: () => {
      /* stub until startLoop assigns the real body */
    },
  };

  // ── Live camera Resources (cameraRuntime) ────────────────────────────────
  //
  // The animation clock, live projection config, and the commit-on-edge
  // bookkeeping refs. Constructed here alongside `frameRef` so wireInput
  // (gesture seed + focus `from`), startLoop (RunFrameDeps), and runFrame
  // (produce + commit-on-edge) all read from one source. Seeded with
  // placeholders; wireInput's bootstrap seed fills real values once the
  // initial OrbitCamera exists.
  //
  // `lastPose` seeds from the camera slice's initial `base` — the single home
  // for the pre-bootstrap placeholder pose — so the first resting frame has a
  // stable pose to read before wireInput's commitCameraPose fires. Copied so a
  // later per-frame `lastPose.current = …` never aliases the store's state.
  const cameraRuntime: CameraRuntime = {
    clock: createCameraClock(),
    projection: { fovYRad: 0, aspect: 1, near: 0.01, far: 50000 },
    lastPose: {
      current: { ...cb.store.getState().camera.base },
    },
    prevActiveId: { current: 'resting' },
  };

  // ── Settings — the injected Redux store ──────────────────────────
  //
  // The settings store is created once at the app root (main.tsx) and
  // injected here, so the engine and React share one instance: React reads
  // it through <Provider> + useAppSelector, the engine reads it each frame
  // via the `state.settings` getter below and writes it through the
  // sub-handle setters' dispatches. The dozens of `state.settings.X` read
  // sites stay byte-identical — the getter hands back `getState().settings`
  // directly, with no parallel mirror to drift.
  const store = cb.store;

  const state: EngineState = {
    // `state.settings` delegates to the injected store. Reads hand back
    // `store.getState().settings`; the write path dispatches through the
    // sub-handle setters, so per-frame reads see the authoritative object
    // with no parallel mirror to keep in sync.
    get settings() {
      return store.getState().settings;
    },
    // `state.tier` delegates to the root `tier` slice the same way `settings`
    // delegates above. The tier saga owns the write; the engine reads here.
    get tier() {
      return store.getState().tier;
    },
    // `state.selection` delegates to the root `selection` slice — the same
    // single-seam pattern as `settings`/`tier`. The pick path dispatches writes;
    // per-frame readers reach the store here, with no engine-side mirror to drift.
    get selection() {
      return store.getState().selection;
    },
    // `state.selectionRows` delegates to the saga-owned `selectionRows` slice.
    // The selection-resolution saga is the sole writer; per-frame readers
    // (selection-ring, structure focus) use this getter.
    get selectionRows() {
      return store.getState().selectionRows;
    },
    // Per-type data stores. Empty at construction; slot commits fill them.
    data: createEngineData(),
    picking: {
      // Per-frame pick-throttle state. Hover / select live on the
      // Redux `selection` slice; see `EnginePickingState.d.ts`.
      // `latestMouseCss`/`lastPickedMouseCss` are gone — hover picking is
      // now fully pointer-driven via `hoverPickDriver` in wireInput.ts, which
      // tracks its own `latest`/`picked` locals.
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      // All GPU handles populate during the async IIFE below and
      // release in `destroy()`.  See `@types/EngineGpuHandles.d.ts`
      // for the null-until-init lifecycle rationale.
      renderer: null,
      pickRenderer: null,
      pickProgram: null,
      milkyWayPickRenderer: null,
      // Canonical fade + source + focus bind-group layouts. Built once in
      // initGpu and threaded into every renderer's createPipelineLayout so
      // consumers share one layout identity. See
      // services/gpu/bindGroupLayouts/fadeUniforms.ts (layout:'auto' trap).
      fadeBgl: null,
      sourceBgl: null,
      focusBgl: null,
      focusUniform: null,
      renderTargets: null,
      compositor: null,
      filamentRenderer: null,
      // labelRenderer + markerLineRenderer: null until initGpu finishes the
      // font-atlas fetch.  Excluded from isEngineReady (optional async
      // resources, null-checked at use by labelsLayer / markerLinesLayer).
      labelRenderer: null,
      markerLineRenderer: null,
      // Second MSDF label renderer for the foreground Sun/Earth captions
      // (Plan 01 — zoom-to-Earth). null until initGpu; excluded from
      // isEngineReady, null-checked at use like labelRenderer.
      foregroundLabelRenderer: null,
      // Leader-line sibling of foregroundLabelRenderer — the NEAR0-slab
      // connectors under the scene-body captions. null until initGpu;
      // excluded from isEngineReady, null-checked at use.
      foregroundMarkerLineRenderer: null,
      // null until initGpu; excluded from isEngineReady, null-checked at use by
      // clipPathDebugLayer.
      debugLineRenderer: null,
      // null until initGpu; excluded from isEngineReady, null-checked at use.
      selectionRingRenderer: null,
      structureMarkerRenderer: null,
      // texturedDiskRenderer / proceduralDiskRenderer: null until initGpu
      // constructs them.  The frame body reads them straight off
      // `state.gpu.*` (see `passes/index.ts`); they live here so `destroy()`
      // can reach them and so later phases consume the same identities.
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      // Milky-Way point cloud + its two-pass renderer. null until initGpu.
      // Excluded from isEngineReady; released in destroy().
      milkyWayCloud: null,
      milkyWayCloudRenderer: null,
      horizonShellRenderer: null,
      // null until initGpu; excluded from isEngineReady — volumeUpsampleLayer
      // null-checks both before hasActiveFields(), so a null state no-ops.
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      // Debug overlays. null until initGpu; the per-frame consumer
      // null-checks each together with its `settings.debug.*` toggle.
      pickDebugOverlay: null,
      diskRadiusRing: null,
      // True-scale textured Earth (Plan 02 — zoom-to-Earth). null until initGpu
      // constructs it + fires the Blue Marble fetch; excluded from
      // isEngineReady, null-checked at use by earthLayer.
      earthRenderer: null,
      // Anchor renderers (Plan 02 — zoom-to-Earth): the resolved near star
      // (the Sun), one instanced planet renderer drawing every seeded
      // planet, and the far-star additive points. null until initGpu;
      // excluded from isEngineReady, null-checked at use by their layers.
      starRenderer: null,
      planetRenderer: null,
      starPointRenderer: null,
      // Debug orbit rings (Earth / Jupiter / Moon) — additive SDF annuli on
      // the (hdr, NEAR0) step. null until initGpu; excluded from
      // isEngineReady, null-checked at use by orbitRingsLayer.
      orbitRingRenderer: null,
      // Per-pass GPU timing service.  Always non-null — a no-op stub until
      // initGpu swaps in the device-aware service.  Consumers gate on
      // `.enabled`.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      // ── LOD impostor planners + atlas ─────────
      // Null until `wireSlots` constructs them post-GPU init.  The hi-res
      // pair (LOD-3) is rebuilt per-tier so its `texture_2d_array` layerSide
      // matches the active tier; the others persist across tier changes.
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      diskPlannerWalk: null,
      hiResFamous: null,
      hiResFamousTexture: null,

      // ── Bias-correction subsystem ─────────────────────────────────
      // Owns Malmquist-bias mode flags, cached per-source ratios/weights,
      // and the async bake state machine.  Eager (no GPU dep); the renderer
      // is wired during initGpu via `attachRenderer`.  The reconcile saga
      // drives bake state via the bias.mode reconcile row.  Production uses
      // the module-level Vite `?worker` runners; tests inject synchronous stubs.
      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.data.galaxies.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Label director ───────────────────────────────────────────
      // The director owns the `labelRenderer.setLabels` /
      // `markerLineRenderer.setLines` calls and declutters across all its
      // `LabelProducer`s (the milkyWay + structure/famous label producers,
      // registered just after this literal).  Renderers are wired in during
      // initGpu so the director sees everything before the first frame.
      labelDirector: createLabelDirectorSubsystem(),

      // ── Cluster focus-mode subsystem ─────────────────────────────
      // Selection-driven: `runFrame` calls `update(selectedStructure, nowMs)` to
      // drive the 400 ms member-isolation fade and threads
      // `produceFocusUniforms` into the points draw.  Eager, no GPU dep.
      structureFocus: createStructureFocusSubsystem({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Clip player ───────────────────────────────────────────────
      // Owns the active clip's scene cues, the clipOpacity channel, and
      // clip-completion lifecycle.  Eager (no GPU dep), non-null from t=0.
      // tick() is called as the first step of runFrame (Task 12).
      clipPlayer: createClipPlayer({
        store: cb.store,
        requestRender: () => state.subsystems.scheduler.requestRender(),
        clock: cameraRuntime.clock,
        getEngineState: () => state,
      }),

      // ── Clip-path inspector (debug) ───────────────────────────────
      // Holds the precomputed ClipPathSnapshot the debug panel's "Calculate"
      // button produces; the clip-path debug pass reads it each frame. Eager
      // (no GPU dep), non-null from t=0; snapshot null until the first Calculate.
      clipPathInspector: createClipPathInspector(),

      // ── Render scheduler — eager, capture-safe ────────────────────
      // Created here (not a deferred shim): its `onFrame` closes over the
      // forward-declared `frame` binding, and the IIFE assigns the real
      // body before any rAF fires.  Anyone capturing the scheduler gets the
      // live one — a deferred shim by reference would break hover-pick on
      // first frames.
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // ── Fade registry ──────────────────────────────────────────
      // Eager so initGpu can register handles without a null-check. Pure
      // CPU — no GPU device at construction.
      fades: createFadeRegistry({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // The rest land later in the IIFE once their deps (GPU device,
      // pickRenderer, scheduler) exist.
      clickResolver: null,
      inputBindings: null,
      // Download-progress aggregator — built inside the IIFE so the
      // `engineLoadProgressChanged` dispatch is the closure target.
      loadProgress: null,
    },
    cam: null,
    // The live camera Resources — clock, projection, lastPose, prevActiveId.
    // Seeded with placeholders; wireInput fills real values at bootstrap.
    cameraRuntime,
    // ── Asset-loading slot bag ───────────────────────────────────────────
    //
    // Each slot is a race-checked fetch→commit pipeline (see
    // `services/loading/AssetSlot.ts`).  The Map is declared up-front so
    // consumers can `state.assetSlots.points.get(source)?.load(...)` without
    // a null check, but the slots are minted inside the GPU init IIFE: they
    // close over GPU handles (renderer, filamentRenderer,
    // volumeFieldRenderer) for their commit step, all null until initGpu
    // resolves.  Minting them all in one IIFE pass keeps the lifecycle
    // uniform — even the GPU-handle-free slots (famousMeta, pgcAlias) are
    // born there.
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      // Tier-aware (unlike cf4Density): setTier reloads on tier change.
      mcpm: null,
      // Default-off velocity flow field; demand-loaded like cf4Density.
      flow: null,
      // Blue Marble Earth texture; descent-gated on cameraDistanceMpc.
      earthTexture: null,
    },
    // ── One-shot transient request flags ────────────────────────────────
    //
    // Edge-triggered UI events that drive demand predicates (palette opened,
    // lazy alias requested) with no persistent home.  The wiring layer sets
    // a key and leaves it set — the demand loop's idle-guard prevents a
    // re-fetch, so no clear is needed.  See `@types/loading/RequestKey.d.ts`.
    requests: new Set<RequestKey>(),
  };

  // ── Register label producers with the director ───────────────────────
  //
  // Registration order = merged label order: milkyWayLabel, then the structure
  // labels, then the famous-galaxy labels.  The director declutters across
  // all of them by `prominencePx`, so registration order only sets the
  // tiebreak for equal-prominence collisions (rare).  All three producers are
  // pure functions over the state; wrap each as a LabelProducer with a stable
  // id.  All eager, so this is synchronous before any frame.
  state.subsystems.labelDirector.registerProducer({
    id: 'milkyWayLabel',
    produceLabels: produceMilkyWayLabel,
  });
  state.subsystems.labelDirector.registerProducer({
    id: 'structureLabels',
    produceLabels: produceStructureLabels,
  });
  state.subsystems.labelDirector.registerProducer({
    id: 'famousLabels',
    produceLabels: produceFamousLabels,
  });

  // ── Cleanup function returned by `attachOrbitControls` ─────────────────
  // Orbit-controls attachment lives outside `inputBindings` because it
  // needs a fully-constructed OrbitCamera, absent at engine() time.  A
  // transient local (single teardown fn, no other consumers), boxed as
  // `{current}` because `attachOrbitControls` runs in the `wireInput`
  // sibling phase.  `destroy()` reads through the ref to detach.
  const detachControlsRef: { current: (() => void) | null } = { current: null };

  // ── Async startup ────────────────────────────────────────────────────────

  // Flat slot registry keyed by `slot.name`, at outer scope so the public
  // handle exposes it as `assetSlots` (the `LoadingDevPanel`).  The IIFE
  // populates it as each slot is minted.  The same instance feeds the
  // load-progress emitter, so the loading bar and dev panel agree on what's
  // in flight.
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.store.dispatch(engineStatusChanged({ kind: 'initializing' }));

  // ── Bootstrap dependency bag ─────────────────────────────────────────────
  //
  // The four bootstrap phases consume a shared `BootstrapDeps` built here:
  // the canvas + cb args, `{current}` ref boxes for forward-declared
  // bindings (frameRef, detachControlsRef, handleRef), and the `allSlots`
  // registry `startLoop` and the loading bar share.
  //
  // `handleRef.current` is null here — the handle is declared after the
  // IIFE below.  `wireInput`'s onDoubleClick reads it lazily, so it's
  // non-null by the time a user can physically double-click.
  const handleRef: { current: EngineHandle | null } = { current: null };
  const bootstrapDeps: BootstrapDeps = {
    canvas,
    cb,
    frameRef,
    detachControlsRef,
    handleRef,
    allSlots,
  };

  // Register all saga runners in one setSagaContext call so the running root
  // saga receives the full context bag synchronously, before the async GPU
  // bootstrap finishes.
  //
  // `makeRunTierTransition(state, bootstrapDeps)` closes over `bootstrapDeps`
  // (reading `device` lazily off `phaseLocals`) — safe to build here because
  // the closure dereferences the device only at call time, after initGpu
  // populates it.
  //
  // `makeReconcileEffects(state)` closes over the live `state.gpu` and
  // `state.subsystems`, also dereferenced lazily at call time — the same
  // rationale: registering before the async bootstrap is safe because the
  // subsystems the closures reach into are populated before any saga dispatches
  // them.
  //
  // `resolveDeps` hands the reconciler saga and the focus-tween saga the LIVE
  // engine resources (read lazily each call, because clouds + structures change
  // as data loads and the GPU lands only after bootstrap). requestRender is NOT
  // added here — selection sagas reach it through the existing `reconcile` bag.
  const resolveDeps = (): ResolveDeps => ({
    catalogs: {
      get: (source: GalaxyCatalogSourceType) => state.data.galaxies.catalogs.get(source),
    },
    famousMeta: state.data.galaxies.famousMeta,
    structures: { byId: (id) => state.data.structures.byId(id) },
  });

  // Bound clip player, hoisted into the saga context as the single clip-run
  // seam: resolves the 'live' pose at dispatch time, attaches the [CANCEL] hook,
  // and returns a Promise that resolves on both natural end and cancellation.
  // The tour saga awaits this for the establishing fly and races it (as
  // dwellDrift) against the dwell timer; `watchClipSaga` runs it for a `playClip`
  // action (the dev panel's single-clip path).
  const playClip = createPlayClip({
    store,
    clipPlayer: state.subsystems.clipPlayer,
    // No null-guard needed: lastPose.current is seeded from camera.base at
    // CameraRuntime construction (synchronous) and playClip is only ever
    // invoked from tour/tween sagas or the dev panel, all after construction.
    getLivePose: () => state.cameraRuntime.lastPose.current,
  });

  // Debug clip-path inspector seam — `watchClipPathInspectSaga` calls `compute`
  // to sample a clip's camera route into the `clipPathInspector` subsystem (read
  // each frame by `clipPathDebugLayer`) and `clear` to drop it. Shares the same
  // live-pose accessor as `playClip` so a `start:'live'` clip samples from the
  // pose the user sees. 384 samples keeps the route + target polylines smooth
  // through the tight Catmull-Rom corners of a flyPath (must stay within the
  // debugLineRenderer's maxLines: 2·(n−1) route+target segments + 9 gizmo).
  const clipPathInspect = createClipPathInspectSeam({
    inspector: state.subsystems.clipPathInspector,
    getLivePose: () => state.cameraRuntime.lastPose.current,
    sampleCount: 384,
  });

  cb.setSagaContext({
    runTierTransition: makeRunTierTransition(state, bootstrapDeps),
    reconcile: makeReconcileEffects(state),
    resolveDeps,
    // The live camera Resources `watchFocusTweenSaga` reads to build a focus tween:
    // the visible from-pose (so a re-focus hands off from what the user sees) and
    // the lens FOV (for structure screen-fill framing). Null when `state.cam` is
    // absent — pre-bootstrap or post-destroy — so the focus tween no-ops rather
    // than tween from a stale pose.
    cameraRuntime: () =>
      state.cam
        ? {
            from: state.cameraRuntime.lastPose.current,
            fovYRad: state.cameraRuntime.projection.fovYRad,
          }
        : null,
    // The live Earth record `watchFlyToEarthKeySaga` frames its descent tween
    // on. Read lazily (like `resolveDeps`) because the scene-body seed installs
    // Earth after the root saga forks; null until then, so the fly-to key
    // no-ops rather than tween toward a body that isn't there.
    earthBody: () => state.data.bodies.earth,
    playClip,
    clipPathInspect,
  });

  // The main async IIFE runs the bootstrap phases; all errors are caught
  // and dispatched via `engineStatusChanged({ kind: 'error' })`.  See `runBootstrapPhases`.
  (async () => {
    try {
      await runBootstrapPhases(state, bootstrapDeps);
    } catch (err) {
      // Surface initialisation failures via the status callback so the UI
      // shows a readable message rather than a blank canvas.
      const message = err instanceof Error ? err.message : String(err);
      cb.store.dispatch(engineStatusChanged({ kind: 'error', message }));
      console.error('Engine startup failed:', err);
    }
  })();

  // ── Public handle ─────────────────────────────────────────────────────────
  //
  // Bespoke local methods handle async bakes, subsystem forwards, multi-field
  // mutations, and live-state reads.  The handle literal at the end stitches
  // them into the public sub-handle clusters.

  // ── Bespoke methods (async bakes, subsystem forwards, multi-field mutations) ──
  //
  // Each owns work a simple store dispatch can't express: async worker bakes,
  // per-source slot reloads, subsystem forwards, multi-field mutations, or
  // returning live state.  Declared up-front so the sub-handle literal can
  // reference each by name — no forward references, no `!` assertions.

  function logCameraStateFn(): void {
    logCameraState(state.cam);
  }

  function loadPgcAliasesFn(): Promise<PgcAliasMap> {
    // Set the edge-triggered flag and wake the loop: the pgcAlias row demands
    // on `request('paletteOpened')`, so the next `reevaluateDemand` fires the
    // load.  The flag stays set (idle-guard prevents a re-fetch), so a second
    // open resolves off the ready slot.  An errored load isn't retried;
    // awaitSlotReady then yields the empty-map fallback.
    state.requests.add('paletteOpened');
    state.subsystems.scheduler.requestRender();
    return awaitSlotReady(state.assetSlots.pgcAlias, new Map() as PgcAliasMap);
  }

  function getCloud(source: SourceType): GalaxyCatalog | undefined {
    return state.data.galaxies.catalogs.get(source);
  }

  function getCloudObjIds(source: SourceType): BigUint64Array | undefined {
    return state.data.galaxies.catalogs.get(source)?.objIDs;
  }

  function getStructures(): readonly StructureInfo[] {
    return state.data.structures.all();
  }

  function destroy(): void {
    // Every subsystem and renderer satisfies `Destroyable`, so this reads as
    // a flat list of `.destroy()` calls.  Ordering is load-bearing only for
    // the first two groups (scheduler before everything; DOM listeners
    // before the subsystems they fire into); past that it's free.

    // 1. Cancel the render loop first — every subsequent destroy() must be
    //    safe after the loop has stopped.
    state.subsystems.scheduler.destroy();

    // 2. Detach DOM listeners before the subsystems they fire into.
    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;

    // 3. Walk every other subsystem (order-independent past here).
    state.subsystems.biasCorrection.destroy();
    state.subsystems.labelDirector.destroy();
    state.subsystems.structureFocus.destroy();
    // Impostor teardown order matters: texturedDisks subscribes to
    // galaxyAtlas's eviction handler (destroy it first); hiResFamous
    // subscribes to its texture's evict handler (destroy the planner before
    // the texture); galaxyAtlas releases its GPU texture last.
    state.subsystems.texturedDisks?.destroy();
    state.subsystems.texturedDisks = null;
    state.subsystems.hiResFamous?.destroy();
    state.subsystems.hiResFamous = null;
    state.subsystems.hiResFamousTexture?.destroy();
    state.subsystems.hiResFamousTexture = null;
    state.subsystems.proceduralDisks?.destroy();
    state.subsystems.proceduralDisks = null;
    // The shared walk holds no GPU resource — just the stride cursor — so
    // its teardown order relative to the atlas is irrelevant; grouped with
    // the disk planners it drives.
    state.subsystems.diskPlannerWalk?.destroy();
    state.subsystems.diskPlannerWalk = null;
    state.subsystems.galaxyAtlas?.destroy();
    state.subsystems.galaxyAtlas = null;
    state.subsystems.clickResolver?.destroy();
    state.subsystems.clickResolver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // 4. GPU renderers.  WebGPU buffers/textures don't release via JS GC, so
    //    destroy() is mandatory.  The point renderer owns the largest
    //    allocations (per-source vertex buffers, ~14 MB GPU + CPU mirror per
    //    SDSS deck).
    state.gpu.pickRenderer?.destroy();
    state.gpu.pickRenderer = null;
    state.gpu.pickProgram?.destroy();
    state.gpu.pickProgram = null;
    state.gpu.milkyWayPickRenderer?.destroy();
    state.gpu.milkyWayPickRenderer = null;
    state.gpu.renderTargets?.destroy();
    state.gpu.renderTargets = null;
    state.gpu.compositor?.destroy();
    state.gpu.compositor = null;
    state.gpu.filamentRenderer?.destroy();
    state.gpu.filamentRenderer = null;
    state.gpu.labelRenderer?.destroy();
    state.gpu.labelRenderer = null;
    state.gpu.foregroundLabelRenderer?.destroy();
    state.gpu.foregroundLabelRenderer = null;
    state.gpu.foregroundMarkerLineRenderer?.destroy();
    state.gpu.foregroundMarkerLineRenderer = null;
    state.gpu.markerLineRenderer?.destroy();
    state.gpu.markerLineRenderer = null;
    state.gpu.debugLineRenderer?.destroy();
    state.gpu.debugLineRenderer = null;
    state.gpu.selectionRingRenderer?.destroy();
    state.gpu.selectionRingRenderer = null;
    state.gpu.structureMarkerRenderer?.destroy();
    state.gpu.structureMarkerRenderer = null;
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayCloud?.destroy();
    state.gpu.milkyWayCloud = null;
    state.gpu.milkyWayCloudRenderer?.destroy();
    state.gpu.milkyWayCloudRenderer = null;
    state.gpu.horizonShellRenderer?.destroy();
    state.gpu.horizonShellRenderer = null;
    state.gpu.volumeFieldRenderer?.destroy();
    state.gpu.volumeFieldRenderer = null;
    state.gpu.flowFieldRenderer?.destroy();
    state.gpu.flowFieldRenderer = null;
    state.gpu.volumeUpsample?.destroy();
    state.gpu.volumeUpsample = null;
    state.gpu.pickDebugOverlay?.destroy();
    state.gpu.pickDebugOverlay = null;
    state.gpu.diskRadiusRing?.destroy();
    state.gpu.diskRadiusRing = null;
    state.gpu.earthRenderer?.destroy();
    state.gpu.earthRenderer = null;
    state.gpu.starRenderer?.destroy();
    state.gpu.starRenderer = null;
    state.gpu.planetRenderer?.destroy();
    state.gpu.planetRenderer = null;
    state.gpu.starPointRenderer?.destroy();
    state.gpu.starPointRenderer = null;
    state.gpu.orbitRingRenderer?.destroy();
    state.gpu.orbitRingRenderer = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();
    state.gpu.renderer?.destroy();
    state.gpu.renderer = null;
    // Shared cluster-focus uniform — released after the renderers that bind
    // its group (points/disks/pick already destroyed above).
    state.gpu.focusUniform?.destroy();
    state.gpu.focusUniform = null;

    // 5. Drop remaining strong references to aid GC.
    for (const source of [...state.data.galaxies.catalogs.keys()]) {
      state.data.galaxies.removeCatalog(source);
    }
    state.cam = null;
  }

  // ── Handle literal — sub-handle clusters + destroy + slots ──
  //
  // Each sub-handle delegates to local functions. This literal is the
  // engine's only public surface; it holds imperative operations (camera,
  // selection, sources, volumes, debug) while store writes go direct to the store.
  const handle: EngineHandle = {
    camera: {
      logState: logCameraStateFn,
    },
    selection: {
      loadAliases: loadPgcAliasesFn,
    },
    sources: {
      getCloud,
      getCloudObjIds,
      getStructures,
    },
    volumes: {
      add: (fieldId, cube) => addVolumeField(state, store, fieldId, cube),
      remove: (fieldId) => removeVolumeField(state, store, fieldId),
      list: () => listVolumeFields(state),
      getState: () => getVolumeFieldsState(state),
    },
    // ── Debug sub-handle (observability + dev toggles) ────────
    //
    // `timingService`: a getter, not a copied reference, because initGpu
    // assigns `state.gpu.timingService` AFTER this literal is built — a copy
    // would be null forever.
    //
    // `passOverrides`: read-only pass-name list for the DebugPanel's renderer
    // toggle section. `allNames` is materialised from the hdr- and swap-target
    // `CONTENT_LAYERS` (the volume-target raymarch has no user toggle, so it is
    // excluded) so the React rows track the frame's actual draw order.
    // The DebugPanel dispatches `setPassDisabled` directly; `watchWakeSaga` wakes
    // the render loop on the store write.
    debug: {
      get timingService() {
        return state.gpu.timingService;
      },
      passOverrides: {
        allNames: CONTENT_LAYERS.filter((l) => l.target !== 'volume').map((p) => p.name),
      },
    },

    destroy,

    // ── Asset-slot registry (dev-panel surface) ──────────────────────────
    //
    // The same `allSlots` Map the IIFE populates, so the dev panel observes
    // slots as they appear.  Read-only at the type level so React-side
    // mutation trips the typechecker.
    assetSlots: allSlots,
  };

  // Publish the handle so `wireInput` can read it lazily. The IIFE may
  // still be in flight, but the handle is non-null well before the user
  // can interact.
  handleRef.current = handle;

  return handle;
}
