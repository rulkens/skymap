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
import type { EngineHomeConfig } from '../../@types/engine/EngineHomeConfig';
import type { EngineState } from '../../@types/engine/state/EngineState';

import { seedCameraRuntime } from './camera/seedCameraRuntime';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from './camera/cameraFraming';
import { liveUpBasisQuat } from './camera/liveUpBasisQuat';
import type { SkyCubemapCaptureRuntime } from '../../@types/engine/state/SkyCubemapCaptureRuntime';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
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
import { CONTENT_PASSES } from './frame/passes';
import { logCameraState } from './helpers/logCameraState';
import { liveRenderCamera } from './helpers/liveRenderCamera';
import { liveWorldPose } from './helpers/liveWorldPose';
import { liveFocusRow } from './helpers/liveFocusRow';
import { deriveBodyStates } from './frame/deriveBodyStates';
import { eyeMpcOf } from '../../utils/camera/eyeMpcOf';
import { cameraDebugSnapshotOf } from '../../utils/camera/cameraDebugSnapshotOf';
import { readOrientDeltas } from './camera/orientDeltas';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { selectTimeState } from '../../state/time/selectors';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
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
 * Start the WebGPU engine on `canvas`. Returns a handle synchronously; async setup
 * (GPU init, data loading) progresses in the background and reaches the UI through
 * `engineStatusChanged` dispatches — including failures, so this never throws.
 */

export function createEngine(
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
  home: EngineHomeConfig,
): EngineHandle {
  // The scheduler needs an `onFrame` at construction time — here — but the real
  // frame body lives in `runFrame.ts` and only lands once `startLoop` runs. The
  // scheduler captures `frameRef` and calls through it, so assigning
  // `frameRef.current` later is enough. A ref, not a `let`, because the bootstrap
  // phases are sibling modules where a `let` would be invisible.
  const frameRef: { current: () => void } = {
    current: () => {
      /* stub until startLoop assigns the real body */
    },
  };

  // Unlike the GPU timing service this needs no `?gpuTimings` gate and no device,
  // so the DebugPanel always has an fps line. `lastStartMs === 0` doubles as the
  // "no frame has run yet" sentinel that seeds the first interval to 0.
  const frameStats = { fps: 0, cpuMs: 0, lastStartMs: 0 };

  // Seeded with placeholders; wireInput re-seeds once the initial OrbitCamera
  // exists. The register seeds from the camera slice's initial `base` — the
  // single home for the pre-bootstrap placeholder pose, arm tag included.
  const cameraRuntime = seedCameraRuntime({
    committed: cb.store.getState().camera.base,
    projection: { fovYRad: 0, aspect: 1, near: NEAR_CLIP_MPC, far: FAR_CLIP_MPC },
  });

  // Sky-cubemap bake bookkeeping — false/infinity/null until the first frame
  // the lensing band goes active; `renderFrame` is the sole writer thereafter.
  const skyCubemapCapture: SkyCubemapCaptureRuntime = {
    lastBandActive: false,
    // Far outside the band pre-boot, so the row's hysteresis margin can't
    // mistake "never measured" for "just closed".
    lastGcDistanceMpc: Number.POSITIVE_INFINITY,
    bakedSettings: null,
  };

  const store = cb.store;

  // Famous stars are seeded at construction, not fetched, so there is no async slot
  // commit to carry the usual `engineSourceCountReported` pulse — report it here so
  // the Stars panel's count chip lights up for the curated row too.
  const engineData = createEngineData();
  store.dispatch(
    engineSourceCountReported({ source: Source.FamousStar, count: SCENE_STARS.length }),
  );

  const state: EngineState = {
    // These five getters delegate straight to the store: sagas and sub-handle
    // setters own the writes, per-frame readers reach the authoritative object
    // here, and there is no engine-side mirror to drift.
    get settings() {
      return store.getState().settings;
    },
    get tier() {
      return store.getState().tier;
    },
    get selection() {
      return store.getState().selection;
    },
    get selectionRows() {
      return store.getState().selectionRows;
    },
    get famousGalaxiesMeta() {
      return selectFamousGalaxiesMeta(store.getState());
    },
    data: engineData,
    picking: {
      // Pick-throttle state only; hover/select live on the Redux `selection` slice.
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      // Every handle here is null until the async bootstrap constructs it and is
      // released in `destroy()`. Only the `isEngineReady` members are relied on
      // downstream; the rest are optional and null-checked at their use site. See
      // `@types/EngineGpuHandles.d.ts` for the lifecycle.
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
      pickProgram: null,
      milkyWayPickRenderer: null,
      // Canonical bind-group layouts, threaded into every renderer's
      // createPipelineLayout so consumers share one layout identity — see
      // services/gpu/bindGroupLayouts/fadeUniforms.ts (the layout:'auto' trap).
      fadeBgl: null,
      sourceBgl: null,
      focusBgl: null,
      focusUniform: null,
      renderTargets: null,
      compositor: null,
      filamentRenderer: null,
      constellationRenderer: null,
      // Read by buildSwapRenderers to rebuild the swap-format renderers on a later
      // format change without re-threading bootstrap deps.
      fontAtlases: null,
      uiCtx: null,
      labelRenderer: null,
      markerLineRenderer: null,
      foregroundLabelRenderer: null,
      foregroundMarkerLineRenderer: null,
      labelPickRenderer: null,
      foregroundLabelPickRenderer: null,
      debugLineRenderer: null,
      selectionRingRenderer: null,
      structureMarkerRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayCloud: null,
      milkyWayCloudRenderer: null,
      horizonShellRenderer: null,
      zoneOfAvoidanceRenderer: null,
      label3DRenderer: null,
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      milkyWayAggregateUpsample: null,
      zoneOfAvoidanceUpsample: null,
      starAggregateUpsample: null,
      // Every bloom content layer's enable gate is exactly `bloomPyramid !== null`,
      // so a null handle silently drops the whole bloom sub-program.
      bloomPyramid: null,
      pickDebugOverlay: null,
      diskRadiusRing: null,
      earthRenderer: null,
      earthSurfaceTileRenderer: null,
      starRenderer: null,
      planetRenderer: null,
      texturedBodyRenderer: null,
      ringRenderer: null,
      cloudShellRenderer: null,
      atmosphereShellRenderer: null,
      starPointRenderer: null,
      bodyGlintRenderer: null,
      sgrAStarLensingRenderer: null,
      starCatalogRenderer: null,
      starCatalogPickRenderer: null,
      bodyPickRenderer: null,
      orbitTrailRenderer: null,
      // The one exception to the null rule: always non-null, a no-op stub until
      // initGpu swaps in the device-aware service. Consumers gate on `.enabled`.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      // The impostor planners are null until `wireSlots` constructs them post-GPU
      // init. The hi-res pair (LOD-3) is rebuilt per-tier so its `texture_2d_array`
      // layerSide matches the active tier; the others persist across tier changes.
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      diskPlannerWalk: null,
      hiResFamous: null,
      hiResFamousTexture: null,

      // Holds no GPU memory even once constructed — the atlas is allocated by the
      // first frame the tile planner engages on.
      earthTiles: null,

      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.data.galaxies.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // The directors own the label/marker-line uploads and declutter across every
      // registered producer; the layers only issue draws against what was flushed.
      cosmoLabelDirector: createLabel2DDirector(COSMO_LABEL_DIRECTOR),
      foregroundLabelDirector: createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR),

      structureFocus: createStructureFocusSubsystem({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      clipPlayer: createClipPlayer({
        store: cb.store,
        requestRender: () => state.subsystems.scheduler.requestRender(),
        getEngineState: () => state,
      }),

      // Eager, because the first rAF can beat the async `wireInput` phase that
      // attaches the recognizer.
      inputAggregator: createInputAggregator(),

      clipPathInspector: createClipPathInspector(),

      // Constructed eagerly, not as a deferred shim: anyone capturing the scheduler
      // gets the live one, and a shim by reference would break hover-pick on the
      // first frames. `onFrame` is the single per-frame chokepoint, which is why
      // the frame-stats timing wraps this one site.
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

      // Eager so initGpu can register handles without a null-check.
      fades: createFadeRegistry({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // Bounds concurrent boot fetches — see `ASSET_QUEUE_CONCURRENCY` for why 2,
      // not the thumbnail queue's `MAX_CONCURRENT_FETCHES`.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),

      clickResolver: null,
      inputBindings: null,
      loadProgress: null,
    },
    booted: false,
    cameraRuntime,
    skyCubemapCapture,
    // The Maps are declared up-front so consumers can reach a slot without a null
    // check, but the slots themselves are minted in `wireSlots`: their commit
    // closures re-read GPU handles at call time and null-guard, rather than assuming
    // `initGpu` already assigned them.
    assetSlots: {
      points: new Map(),
      starCatalogs: new Map(),
      filaments: null,
      famousGalaxiesMeta: null,
      famousStarsMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      // Tier-aware (unlike cf4Density): setTier reloads on tier change.
      mcpm: null,
      flow: null,
      // Tier-aware like mcpm.
      polyphorm2Mrs: null,
      mcpmWorkbench: null,
      constellations: null,
      bodyTextures: new Map(),
      // One boot fetch seeding every body's placeholder, so no body ever draws
      // untextured while its own map loads.
      bodyTextureAtlas: null,
    },
    // Edge-triggered UI events driving demand predicates. The wiring layer sets a
    // key and leaves it set — the demand loop's idle-guard prevents a re-fetch.
    requests: new Set<RequestKey>(),
  };

  // Registration order only sets the tiebreak for equal-`prominencePx` collisions;
  // the director declutters by prominence otherwise. The constellation figure NAMES
  // are deliberately NOT here: their anchors sit at parsec distances, inside the
  // COSMO slab's fixed 0.01-Mpc near plane, so a label here could never draw — they
  // register on `foregroundLabelDirector` (NEAR0) below.
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

  // Scene-body captions first so an equal-prominence tiebreak favours the
  // navigation aid over the diffuse constellation overlay.
  state.subsystems.foregroundLabelDirector.registerProducer({
    id: 'sceneBodyCaptions',
    produceLabels: produceSceneBodyCaptions,
  });
  state.subsystems.foregroundLabelDirector.registerProducer({
    id: 'constellationCaptions',
    produceLabels: produceConstellationCaptions,
  });

  // Orbit-controls attachment lives outside `inputBindings` because it needs a
  // fully-constructed OrbitCamera, absent at engine() time; boxed because
  // `attachOrbitControls` runs in the sibling `wireInput` phase.
  const detachControlsRef: { current: (() => void) | null } = { current: null };

  // One instance feeds both the dev panel and the load-progress emitter, so the
  // loading bar and the panel agree on what is in flight.
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.store.dispatch(engineStatusChanged({ kind: 'initializing' }));

  // Null here — the handle is declared after the IIFE below. `wireInput` reads it
  // lazily, so it is non-null by the time a user can physically double-click.
  const handleRef: { current: EngineHandle | null } = { current: null };
  const bootstrapDeps: BootstrapDeps = {
    canvas,
    cb,
    home,
    frameRef,
    detachControlsRef,
    handleRef,
    allSlots,
  };

  // Every runner below is registered in ONE `setSagaContext` call before the async
  // GPU bootstrap finishes, which is safe only because each closure dereferences
  // its engine resources lazily, at call time.
  const resolveDeps = (): ResolveDeps => ({
    catalogs: {
      get: (source: GalaxyCatalogSourceType) => state.data.galaxies.catalogs.get(source),
    },
    famousGalaxiesMeta: state.famousGalaxiesMeta,
    structures: { byId: (id) => state.data.structures.byId(id) },
    // The first (only, in v1) committed Gaia catalog, or null before the star cloud
    // lands and after the GPU tears down.
    stars: {
      current: () => {
        const renderer = state.gpu.starCatalogRenderer;
        if (!renderer) return null;
        for (const { catalog } of renderer.loadedCatalogs()) return catalog;
        return null;
      },
    },
  });

  // The single clip-run seam the saga context exposes.
  const playClip = createPlayClip({
    store,
    clipPlayer: state.subsystems.clipPlayer,
    getLivePose: () => liveWorldPose(state),
  });

  // `sampleCount` must cover the WAYPOINT-DENSEST clip, not the sparse demo path: a
  // flyPath threading ~200 waypoints gets only ~1.9 samples per leg at 384, so the
  // polyline draws raw waypoint-to-waypoint CHORDS and hides the spline between
  // knots — hard corners everywhere. 4000 is ~20 per leg on such a route, and stays
  // within debugLineRenderer's maxLines (2·(n−1) + 9 gizmo = 8007 against 8192).
  const clipPathInspect = createClipPathInspectSeam({
    inspector: state.subsystems.clipPathInspector,
    getLivePose: () => liveWorldPose(state),
    sampleCount: 4000,
  });

  cb.setSagaContext({
    runTierTransition: makeRunTierTransition(state, bootstrapDeps),
    reconcile: makeReconcileEffects(state, canvas),
    resolveDeps,
    // The up-basis quaternion is resolved THIS frame, so a mid-slerp re-switch
    // captures the live pole rather than snapping to the committed frame. Null
    // pre-bootstrap and post-destroy, so a saga no-ops rather than seeding stale.
    cameraRuntime: () =>
      state.booted
        ? {
            from: liveWorldPose(state),
            fovYRad: state.cameraRuntime.outputs.projection.fovYRad,
            upBasisQuat: liveUpBasisQuat(state.cameraRuntime),
          }
        : null,
    playClip,
    clipPathInspect,
  });

  // `void`: nothing awaits engine construction, and the catch routes failures to
  // the status callback rather than an unhandled rejection.
  void (async () => {
    try {
      await runBootstrapPhases(state, bootstrapDeps);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cb.store.dispatch(engineStatusChanged({ kind: 'error', message }));
      console.error('Engine startup failed:', err);
    }
  })();

  // Declared up-front so the handle literal can reference each by name — no forward
  // references, no `!` assertions.
  function logCameraStateFn(): void {
    const simDays = state.cameraRuntime.outputs.simDays;
    logCameraState(
      liveRenderCamera(state),
      canvas,
      liveFocusRow(state.selectionRows.focus, simDays),
      simDays,
      state.subsystems.earthTiles?.getDebugSnapshot().subCamera ?? null,
      state.cameraRuntime.outputs.displayed,
    );
  }

  function loadPgcAliasesFn(): Promise<PgcAliasMap> {
    // The pgcAlias row demands on `request('paletteOpened')`, so setting the flag
    // and waking the loop is what fires the load. The flag stays set, so a second
    // open resolves off the ready slot; an errored load isn't retried, and
    // `awaitSlotReady` then yields the empty-map fallback.
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
    // Ordering is load-bearing only for the first two groups: the render loop stops
    // before anything it touches is torn down, and DOM listeners detach before the
    // subsystems they fire into. Past that it is free.
    state.subsystems.scheduler.destroy();
    state.subsystems.assetQueue.destroy();

    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;
    // Drop anything the recognizer queued but no frame ever drained.
    state.subsystems.inputAggregator.destroy();
    // Undefined only if the GPU IIFE errored before registering the HDR-capability
    // matchMedia listener — `phaseLocals` is assigned immediately after it.
    bootstrapDeps.phaseLocals?.unwatchHdrCapability();

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
    state.subsystems.diskPlannerWalk?.destroy();
    state.subsystems.diskPlannerWalk = null;
    state.subsystems.galaxyAtlas?.destroy();
    state.subsystems.galaxyAtlas = null;
    // Owns a 67 MB atlas and a page-table texture once engaged, neither of which
    // WebGPU releases on GC.
    state.subsystems.earthTiles?.destroy();
    state.subsystems.earthTiles = null;
    state.subsystems.clickResolver?.destroy();
    state.subsystems.clickResolver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // WebGPU buffers/textures don't release via JS GC, so destroy() is mandatory.
    // The walk is REVERSED because registry declaration order is construction order
    // — so `focusUniform` is destroyed last, after the pick renderer that captured
    // its bind group at construction.
    destroyGpuHandles(GPU_HANDLE_ROWS, state);
    // fontAtlases/uiCtx own no GPU resource — re-nulled for lifecycle symmetry.
    state.gpu.fontAtlases = null;
    state.gpu.uiCtx = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();

    for (const source of [...state.data.galaxies.catalogs.keys()]) {
      state.data.galaxies.removeCatalog(source);
    }
    state.booted = false;
  }

  // The engine's only public surface: imperative operations only — store writes go
  // direct to the store.
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
    debug: {
      // A getter, not a copied reference: initGpu assigns `state.gpu.timingService`
      // AFTER this literal is built, so a copy would be null forever.
      get timingService() {
        return state.gpu.timingService;
      },
      // `idle` is derived, not stored, from the wall-clock gap since the last frame,
      // so a sleeping render-on-demand loop reads "idle" rather than a stale fps.
      frameStats: (): FrameStats => ({
        fps: Math.round(frameStats.fps),
        cpuMs: frameStats.cpuMs,
        idle:
          frameStats.lastStartMs === 0 || performance.now() - frameStats.lastStartMs > IDLE_GAP_MS,
      }),
      // The volume-target raymarch has no user toggle, so it is excluded.
      passOverrides: {
        allNames: CONTENT_PASSES.filter((l) => l.target !== 'volume').map((p) => p.name),
      },
      // Re-derived per call, not snapshotted: the slots this joins against are
      // minted by the async bootstrap.
      assetPriorities: () => assetPriorityBySlotName(state),
      earthTiles: () =>
        state.subsystems.earthTiles?.getDebugSnapshot() ?? EMPTY_EARTH_TILE_DEBUG_SNAPSHOT,
      // An off-frame read that never writes camera state, so it goes through
      // `liveWorldPose` + `deriveBodyStates` at `outputs.simDays`. `liveSimDays`
      // alone resolves fresh — it is what the epoch-mismatch check compares against.
      cameraDebug: () => {
        const rootState = store.getState();
        const time = selectTimeState(rootState);
        const { register, surface, outputs } = state.cameraRuntime;
        const bodyStates = deriveBodyStates(outputs.simDays) as ReadonlyMap<BodyId, BodyState>;
        return cameraDebugSnapshotOf({
          storedFrame: rootState.camera.base.frame,
          renderedPose: outputs.displayed,
          worldPose: liveWorldPose(state),
          poseBasis: ORIENTATION_FRAMES[state.settings.orientation],
          upBasis: outputs.upBasis,
          orientationFrame: state.settings.orientation,
          bodyStates,
          lastRenderedSimDays: outputs.simDays,
          liveSimDays: deriveSimDays(time, performance.now()),
          time,
          activeDriverId: register.winner,
          gesture: surface.gesture,
          rememberedTiltRad: surface.rememberedTiltRad,
          tuning: rootState.camera.tuning,
          deltas: readOrientDeltas(),
        });
      },
    },

    destroy,

    // The same Map the bootstrap populates, so the dev panel observes slots as they
    // appear. Read-only at the type level, so React-side mutation trips tsc.
    assetSlots: allSlots,
  };

  handleRef.current = handle;

  return handle;
}
