/**
 * Engine — the imperative WebGPU core. It owns the device, the camera and the raw
 * browser input, and knows nothing about React: every observable piece of state
 * (lifecycle, scale, counts, load progress, selection) is dispatched straight to the
 * Redux store, and `EngineCallbacks` carries only the injected `store` +
 * `setSagaContext` — no event-callback clusters. Leaf helpers and cohesive
 * subsystems live in sibling modules; the async bootstrap runs as the `phases/`
 * sequence. The public handle and the `frameRef` / `detachControlsRef` / `handleRef`
 * boxes stay inline because those phases write them through the `{current}` pattern.
 */

import type { SourceType } from '../../@types/data/SourceType';
import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineState } from '../../@types/engine/state/EngineState';

import { createCameraClock } from './camera/cameraClock';
import { liveUpBasisQuat } from './camera/liveUpBasisQuat';
import type { CameraRuntime } from '../../@types/engine/state/CameraRuntime';
import { CONST_J2000 } from '../../data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../data/defaults';
import { createEngineData } from './data/createEngineData';
import { SCENE_STARS } from '../../data/bodies/sceneStars';
import { Source } from '../../data/source';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createLabel2DDirector } from './subsystems/label2DDirector';
import { COSMO_LABEL_DIRECTOR } from '../../data/labels/cosmoLabelDirectorConfig';
import { FOREGROUND_LABEL_DIRECTOR } from '../../data/labels/foregroundLabelDirectorConfig';
import { produceMilkyWayLabel } from './presentation/produceMilkyWayLabel';
import { produceStructureLabels } from './presentation/produceStructureLabels';
import { produceFamousGalaxyLabels } from './presentation/produceFamousGalaxyLabels';
import { produceSceneBodyCaptions } from './presentation/produceSceneBodyCaptions';
import { produceConstellationCaptions } from './presentation/produceConstellationCaptions';
import { createStructureFocusSubsystem } from './subsystems/structureFocusSubsystem';
import { createClipPlayer } from './subsystems/clipPlayer';
import { createClipPathInspector } from './subsystems/clipPathInspector';
import { createInputAggregator } from './subsystems/inputAggregator';
import { CONTENT_LAYERS } from './frame/passes';
import { logCameraState } from './helpers/logCameraState';
import { liveRenderCamera } from './helpers/liveRenderCamera';
import { liveFocusRow } from './helpers/liveFocusRow';
import { engineStatusChanged, engineSourceCountReported } from '../../state/engine/engineSlice';
import { selectFamousGalaxiesMeta } from '../../state/engine/selectors';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../@types/loading/PgcAliasMap';
import type { RequestKey } from '../../@types/loading/RequestKey';
import { awaitSlotReady } from '../loading/awaitSlotReady';

import { runBootstrapPhases } from './phases/bootstrap';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';
import { destroyGpuHandles } from './gpuHandles/destroyGpuHandles';
import { GPU_HANDLE_ROWS } from './gpuHandles/gpuHandleRegistry';
import { updateFrameStats, IDLE_GAP_MS } from '../../utils/perf/updateFrameStats';
import { PriorityQueue } from '../../utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../utils/concurrency/assetQueueConcurrency';
import type { FrameStats } from '../../@types/engine/FrameStats';
import { EMPTY_EARTH_TILE_DEBUG_SNAPSHOT } from './subsystems/earthTileSubsystem';
import { uploadVolumeField } from './volume/uploadVolumeField';
import { unloadVolumeField } from './volume/unloadVolumeField';
import { listVolumeFields } from './handles/listVolumeFields';
import { getVolumeFieldsState } from './handles/getVolumeFieldsState';
import { makeRunTierTransition } from './wiring/makeRunTierTransition';
import { makeReconcileEffects } from './wiring/makeReconcileEffects';
import { assetPriorityBySlotName } from './wiring/assetPriorityBySlotName';
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

  // ── Always-on CPU-side frame stats ────────────────────────────────────────
  //
  // A mutable tracker the render scheduler's `onFrame` chokepoint folds into
  // every frame, exposed read-only through `handle.debug.frameStats()`.  Unlike
  // the GPU timing service this needs no `?gpuTimings` gate and no device — it
  // times the JS frame body with `performance.now()`, so the DebugPanel can show
  // an fps + CPU-frame-time line at all times.  `lastStartMs === 0` doubles as
  // the "no frame has run yet" sentinel that seeds the first interval to 0 (the
  // idle-gap guard in `updateFrameStats` skips that fold — see its header).
  const frameStats = { fps: 0, cpuMs: 0, lastStartMs: 0 };

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
    // Seeded at J2000, a plausible epoch before the first frame runs. No frame
    // has run pre-bootstrap, so no pick can fire against it; `runFrame` overwrites
    // it with the real frame instant before the first pick is possible.
    lastRenderedSimDays: { current: CONST_J2000 },
    // Seeded with the default frame's steady basis so a pre-first-frame read is
    // valid; `runFrame` overwrites it with the resolved B(t) each frame. Copied
    // so the seed never aliases the shared registry entry.
    upBasis: { current: [...ORIENTATION_FRAMES[DEFAULT_ORIENTATION]] },
    // Sky-cubemap capture bookkeeping (Task 12) — empty/false/null until the
    // first frame the lensing band goes active; `renderFrame` is the sole
    // writer thereafter.
    skyCubemapCapture: {
      lastCapturedAtMs: new Map(),
      frameIndex: 0,
      wasBandActive: false,
      lastSweepCamPosMpc: null,
    },
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

  // Famous stars are seeded at construction (createEngineData →
  // SCENE_STARS), not fetched, so there is no async slot commit to carry the
  // usual `engineSourceCountReported` pulse. Report it here instead — the
  // same action the survey star/galaxy catalogs' slots dispatch on load — so
  // the Stars panel's count chip lights up for the curated row too.
  const engineData = createEngineData();
  store.dispatch(
    engineSourceCountReported({ source: Source.FamousStar, count: SCENE_STARS.length }),
  );

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
    // Same single-seam pattern as `settings`/`tier`/`selectionRows` above — no
    // engine-side mirror of the store slice to drift.
    get famousGalaxiesMeta() {
      return selectFamousGalaxiesMeta(store.getState());
    },
    // Per-type data stores. Galaxies/structures are empty at construction and
    // fill via slot commits; bodies (incl. the famous-star seed) are filled
    // synchronously inside `createEngineData` itself — see its header.
    data: engineData,
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
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
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
      constellationRenderer: null,
      // fontAtlases + uiCtx: null until initGpu resolves the font-atlas fetch;
      // read by buildSwapRenderers to rebuild the swap-format renderers below
      // on a later format change without re-threading bootstrap deps.
      fontAtlases: null,
      uiCtx: null,
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
      // The two label pick providers, one per slab. null until initGpu;
      // excluded from isEngineReady, null-checked at use by the label layers'
      // drawPick.
      labelPickRenderer: null,
      foregroundLabelPickRenderer: null,
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
      // Galactic-plane dust-band guide. null until initGpu; excluded from
      // isEngineReady, null-checked at use by zoneOfAvoidanceLayer.
      zoneOfAvoidanceRenderer: null,
      // Shared world-geometry text renderer. null until initGpu; its first
      // consumer is the zone-of-avoidance lettering path, null-checked at use.
      label3DRenderer: null,
      // null until initGpu; excluded from isEngineReady — volumeUpsampleLayer
      // null-checks both before hasActiveFields(), so a null state no-ops.
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      // null until initGpu; excluded from isEngineReady —
      // milkyWayUpsampleLayer null-checks it in draw, so a null no-ops.
      milkyWayAggregateUpsample: null,
      // null until initGpu; excluded from isEngineReady —
      // zoneOfAvoidanceUpsampleLayer null-checks it in draw, so a null no-ops.
      zoneOfAvoidanceUpsample: null,
      // null until initGpu; excluded from isEngineReady —
      // starAggregateUpsampleLayer null-checks it in draw, so a null no-ops.
      starAggregateUpsample: null,
      // null until initGpu; excluded from isEngineReady — every bloom content
      // layer's enable gate is exactly `bloomPyramid !== null`, so a null handle
      // silently drops the whole bloom sub-program.
      bloomPyramid: null,
      // Debug overlays. null until initGpu; the per-frame consumer
      // null-checks each together with its `settings.debug.*` toggle.
      pickDebugOverlay: null,
      diskRadiusRing: null,
      // True-scale textured Earth (Plan 02 — zoom-to-Earth). null until initGpu
      // constructs it; its 'earth' texture slot in the bodyTextures family
      // (proximity-demanded, commits via setMap) is minted later, in wireSlots.
      // Excluded from isEngineReady, null-checked at use by earthLayer.
      earthRenderer: null,
      // Instanced surface-tile detail draw over the base globe. null until
      // initGpu; excluded from isEngineReady, null-checked at use by earthLayer.
      earthSurfaceTileRenderer: null,
      // Anchor renderers (Plan 02 — zoom-to-Earth): the resolved near star
      // (the Sun), one instanced planet renderer drawing every seeded
      // planet, and the far-star additive points. null until initGpu;
      // excluded from isEngineReady, null-checked at use by their layers.
      starRenderer: null,
      planetRenderer: null,
      // Shared textured-sphere renderer for every non-Earth textured body; the
      // bodyTextures family's commit/onRelease call its setMap/clearMap.
      texturedBodyRenderer: null,
      // Saturn's rings — the translucent overlay half of the ring system, drawn
      // last in the (foreground:0, NEAR0) group. null until initGpu; excluded
      // from isEngineReady, null-checked at use by ringsLayer.
      ringRenderer: null,
      // Earth's translucent cloud shell — the thin deck drawn just above the
      // opaque surface, immediately after earthLayer in the (foreground:0, NEAR0)
      // group. null until initGpu; excluded from isEngineReady, null-checked at
      // use by cloudShellLayer.
      cloudShellRenderer: null,
      // The in-scatter atmosphere — the outermost translucent shell, drawn LAST in
      // the (foreground:0, NEAR0) group and also read by the atmosphereSkyView step.
      atmosphereShellRenderer: null,
      starPointRenderer: null,
      // Sub-pixel bodies (the glints branch of the body partition) as
      // brightness-scaled additive points on the (hdr, NEAR0) step — the far
      // half of the body LOD, sibling of starPointRenderer. null until initGpu;
      // excluded from isEngineReady, null-checked at use by bodyGlintsLayer.
      bodyGlintRenderer: null,
      starCatalogRenderer: null,
      starCatalogPickRenderer: null,
      // r32uint pick provider for the NEAR0 foreground bodies (Earth / planets /
      // scene-star spheres + the sub-pixel scene-star points). null until
      // initGpu; excluded from isEngineReady, driven by the body layers' drawPick.
      bodyPickRenderer: null,
      // Keplerian orbit trails (Earth / Jupiter / Moon) — additive screen-space
      // conics on the (hdr, NEAR0) step. null until initGpu; excluded from
      // isEngineReady, null-checked at use by orbitTrailsLayer.
      orbitTrailRenderer: null,
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

      // ── Earth surface virtual texture ─────────────────────────────
      // Null until `wireSlots` constructs it post-GPU init, and holding no
      // GPU memory even then — the atlas is allocated by the first frame the
      // tile planner engages on.
      earthTiles: null,

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
      // `Label2DProducer`s (the milkyWay + structure/famous label producers,
      // registered just after this literal).  Renderers are wired in during
      // initGpu so the director sees everything before the first frame.
      cosmoLabelDirector: createLabel2DDirector(COSMO_LABEL_DIRECTOR),

      // ── Foreground label director ──────────────────────────────────
      // The NEAR0 sibling of `cosmoLabelDirector` — same factory, `screenSeparation`
      // + `exponentialApproach` + lift arms instead. Owns the caption + leader-
      // line upload for `produceSceneBodyCaptions` + `produceConstellationCaptions`
      // (registered just after this literal); `foregroundLabelsLayer` only
      // issues the draw calls against what this director already flushed.
      foregroundLabelDirector: createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR),

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

      // ── Input aggregator ──────────────────────────────────────────
      // Collects the gesture recognizer's events; `drainInput` applies them
      // once per frame.  Eager (no GPU dep) — the first rAF can beat the
      // async `wireInput` phase that attaches the recognizer.
      inputAggregator: createInputAggregator(),

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
      // `onFrame` is the single per-frame chokepoint — every rAF the scheduler
      // fires runs the real body here.  Timing wraps this one site (loop entry →
      // after the body returns, which is post-submit) so the frame stats stay a
      // pure measurement: the body is invoked exactly as before, unmodified.
      scheduler: createRenderScheduler({
        onFrame: () => {
          const start = performance.now();
          const intervalMs = frameStats.lastStartMs === 0 ? 0 : start - frameStats.lastStartMs;
          frameStats.lastStartMs = start;
          frameRef.current();
          const next = updateFrameStats(frameStats, {
            intervalMs,
            cpuMs: performance.now() - start,
          });
          frameStats.fps = next.fps;
          frameStats.cpuMs = next.cpuMs;
        },
      }),

      // ── Fade registry ──────────────────────────────────────────
      // Eager so initGpu can register handles without a null-check. Pure
      // CPU — no GPU device at construction.
      fades: createFadeRegistry({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Boot asset queue ──────────────────────────────────────────
      // Bounds how many boot fetches (catalog `.bin` files, body textures)
      // run at once — see `ASSET_QUEUE_CONCURRENCY` for why 2, not the
      // thumbnail queue's `MAX_CONCURRENT_FETCHES`. Eager, no GPU dep:
      // `evaluateRows` (the per-frame demand walk) can enqueue before the
      // GPU init IIFE below finishes.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),

      // The rest land later in the IIFE once their deps (GPU device,
      // galaxyPickRenderer, scheduler) exist.
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
    // a null check, but the slots are minted in `wireSlots`: their commit
    // closures re-read GPU handles (renderer, filamentRenderer,
    // volumeFieldRenderer) at call time and null-guard, rather than assuming
    // `initGpu` already assigned them — the same destroy-race posture the
    // keyed `bodyTextures` family below uses.
    assetSlots: {
      points: new Map(),
      // Per-source star catalogs — registry-built (wireSlots), like points;
      // the star slot's commit null-guards the renderer the same way.
      starCatalogs: new Map(),
      filaments: null,
      famousGalaxiesMeta: null,
      famousStarsMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      // Tier-aware (unlike cf4Density): setTier reloads on tier change.
      mcpm: null,
      // Default-off velocity flow field; demand-loaded like cf4Density.
      flow: null,
      // Default-off 2MRS Polyphorm density volume; tier-aware like mcpm.
      polyphorm2Mrs: null,
      // Hidden until Phase 4 clears; untiered like cf4Density.
      mcpmWorkbench: null,
      // Constellation stick-figure artifact; demand-loaded on its master gate.
      constellations: null,
      // Keyed body-surface texture family (Earth + planets/moons + Saturn ring),
      // minted in wireSlots. Empty map at construction — proximity-demanded +
      // released per body (mirrors the `points` map).
      bodyTextures: new Map(),
      // The all-bodies low-res atlas: one boot fetch seeding every body's
      // placeholder, so no body ever draws untextured while its own map loads.
      bodyTextureAtlas: null,
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
  // labels, then the famous-galaxy labels.  The director declutters across all
  // of them by `prominencePx`, so registration order only sets the tiebreak for
  // equal-prominence collisions (rare).  All producers are pure functions over
  // the state; wrap each as a Label2DProducer with a stable id.  All eager, so
  // this is synchronous before any frame.
  //
  // The constellation figure NAMES are deliberately NOT here: their anchors sit
  // at parsec distances, inside the COSMO slab's fixed 0.01-Mpc near plane this
  // director projects through, so a label here could never draw. They register
  // on `foregroundLabelDirector` (NEAR0) instead, just below.
  state.subsystems.cosmoLabelDirector.registerProducer({
    id: 'milkyWayLabel',
    produceLabels: produceMilkyWayLabel,
  });
  state.subsystems.cosmoLabelDirector.registerProducer({
    id: 'structureLabels',
    produceLabels: produceStructureLabels,
  });
  state.subsystems.cosmoLabelDirector.registerProducer({
    id: 'famousLabels',
    produceLabels: produceFamousGalaxyLabels,
  });

  // The NEAR0 sibling registration: scene-body captions first, matching the
  // COSMO order's "landmark before decoration" shape — body captions are
  // navigation aids, the constellation figures a diffuse orientation overlay
  // (`captionPriority.ts`'s own ranking) — so an equal-`prominencePx` tiebreak
  // (rare) favours the body.
  state.subsystems.foregroundLabelDirector.registerProducer({
    id: 'sceneBodyCaptions',
    produceLabels: produceSceneBodyCaptions,
  });
  state.subsystems.foregroundLabelDirector.registerProducer({
    id: 'constellationCaptions',
    produceLabels: produceConstellationCaptions,
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
    famousGalaxiesMeta: state.famousGalaxiesMeta,
    structures: { byId: (id) => state.data.structures.byId(id) },
    // The sole loaded star catalog — the first (only, in v1) committed Gaia
    // catalog off the renderer, or null before the star cloud lands or after
    // the GPU tears down. Read lazily like the other getters so a star pick /
    // deep-link always sees the current catalog.
    stars: {
      current: () => {
        const renderer = state.gpu.starCatalogRenderer;
        if (!renderer) return null;
        for (const { catalog } of renderer.loadedCatalogs()) return catalog;
        return null;
      },
    },
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
  // pose the user sees.
  //
  // The sample count must cover the WAYPOINT-DENSEST clip, not just the sparse
  // demo path: a flyPath threading ~200 waypoints gives 384 samples only ~1.9
  // per leg — the polyline then draws the raw waypoint-to-waypoint CHORDS and
  // hides the smooth spline between knots, reading as hard corners everywhere.
  // 4000 samples is ~20 per leg on such a route, enough to resolve the actual
  // curve so a smooth stretch reads smooth and only genuinely tight turns
  // still bend. This must stay within the
  // debugLineRenderer's maxLines (2·(n−1) route+target segments + 9 gizmo =
  // 8007 here; the renderer is built with 8192 in `initGpu`).
  const clipPathInspect = createClipPathInspectSeam({
    inspector: state.subsystems.clipPathInspector,
    getLivePose: () => state.cameraRuntime.lastPose.current,
    sampleCount: 4000,
  });

  cb.setSagaContext({
    runTierTransition: makeRunTierTransition(state, bootstrapDeps),
    reconcile: makeReconcileEffects(state, canvas),
    resolveDeps,
    // The live camera Resources the focus and orientation sagas read off the
    // frame loop: the visible from-pose (so a re-focus hands off from what the
    // user sees), the lens FOV (for structure screen-fill framing), and the
    // up-basis quaternion resolved THIS frame via `liveUpBasisQuat`, so a
    // mid-slerp re-switch captures the live pole rather than snapping to the
    // committed frame. Null when `state.cam` is absent — pre-bootstrap or
    // post-destroy — so both sagas no-op rather than seed from a stale pose.
    cameraRuntime: () =>
      state.cam
        ? {
            from: state.cameraRuntime.lastPose.current,
            fovYRad: state.cameraRuntime.projection.fovYRad,
            upBasisQuat: liveUpBasisQuat(state.cameraRuntime),
          }
        : null,
    playClip,
    clipPathInspect,
  });

  // The main async IIFE runs the bootstrap phases; all errors are caught
  // and dispatched via `engineStatusChanged({ kind: 'error' })`.  See `runBootstrapPhases`.
  // `void`: nothing awaits engine construction, and the catch below already
  // routes failures to the status callback rather than an unhandled rejection.
  void (async () => {
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
    const simDays = state.cameraRuntime.lastRenderedSimDays.current;
    logCameraState(
      liveRenderCamera(state),
      canvas,
      liveFocusRow(state.selectionRows.focus, simDays),
      simDays,
      state.subsystems.earthTiles?.getDebugSnapshot().subCamera ?? null,
    );
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
    state.subsystems.assetQueue.destroy();

    // 2. Detach DOM listeners before the subsystems they fire into.
    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;
    // Drop anything the recognizer queued but no frame ever drained.
    state.subsystems.inputAggregator.destroy();
    // The HDR-capability matchMedia listener `initGpu` registers via
    // `watchHdrCapability` — `phaseLocals` is assigned immediately after
    // registration (not at the end of `initGpu`'s many-hundred-line body),
    // so this is undefined only if the GPU IIFE errored before that point:
    // device/context acquisition or the listener registration itself.
    bootstrapDeps.phaseLocals?.unwatchHdrCapability();

    // 3. Walk every other subsystem (order-independent past here).
    state.subsystems.biasCorrection.destroy();
    state.subsystems.cosmoLabelDirector.destroy();
    state.subsystems.foregroundLabelDirector.destroy();
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
    // The Earth tile subsystem owns a 67 MB atlas and a page-table texture
    // once engaged, neither of which WebGPU releases on GC. Order-independent:
    // nothing subscribes to it.
    state.subsystems.earthTiles?.destroy();
    state.subsystems.earthTiles = null;
    state.subsystems.clickResolver?.destroy();
    state.subsystems.clickResolver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // 4. GPU renderers.  WebGPU buffers/textures don't release via JS GC, so
    //    destroy() is mandatory.  One reverse walk over GPU_HANDLE_ROWS covers
    //    every registry-owned handle: declaration order is construction order
    //    (`focusUniform` first, `pickProgram`/`galaxyPickRenderer` last —
    //    see gpuHandleRegistry.ts), so the reversed walk destroys the two
    //    pick rows first and `focusUniform` last, after the pick renderer
    //    that captures its bind group at construction.
    destroyGpuHandles(GPU_HANDLE_ROWS, state);
    // The 6 registry exclusions keep their own teardown. fontAtlases/uiCtx
    // own no GPU resource (decoded atlas data / raw device+context+canvas
    // refs) — re-nulled for lifecycle symmetry, not released.
    state.gpu.fontAtlases = null;
    state.gpu.uiCtx = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();

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
      add: (fieldId, cube) => uploadVolumeField(state, store, fieldId, cube),
      remove: (fieldId) => unloadVolumeField(state, store, fieldId),
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
      // Snapshot the rolling CPU-side frame stats. `fps` is rounded for display;
      // `idle` is derived here (not stored) from the wall-clock gap since the
      // last frame, so a sleeping render-on-demand loop reads "idle" rather than
      // a stale fps. `lastStartMs === 0` means no frame has run yet.
      frameStats: (): FrameStats => ({
        fps: Math.round(frameStats.fps),
        cpuMs: frameStats.cpuMs,
        idle:
          frameStats.lastStartMs === 0 || performance.now() - frameStats.lastStartMs > IDLE_GAP_MS,
      }),
      passOverrides: {
        allNames: CONTENT_LAYERS.filter((l) => l.target !== 'volume').map((p) => p.name),
      },
      // Re-derived per call off the live state rather than snapshotted: the
      // slots this joins against are minted by the async IIFE below.
      assetPriorities: () => assetPriorityBySlotName(state),
      // `state.subsystems.earthTiles` is null before Earth's slot wires (and
      // again after destroy), so the fallback keeps the panel's read total.
      earthTiles: () =>
        state.subsystems.earthTiles?.getDebugSnapshot() ?? EMPTY_EARTH_TILE_DEBUG_SNAPSHOT,
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
