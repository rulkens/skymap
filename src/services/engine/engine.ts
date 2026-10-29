/**
 * Engine — the imperative WebGPU core. It owns the device and the camera, reads
 * input from the `input` slice, and knows nothing about React: every observable piece of state
 * (lifecycle, scale, counts, load progress, selection) is dispatched straight to the
 * Redux store, and `EngineCallbacks` carries only the injected `store` +
 * `setSagaContext` — no event-callback clusters. Leaf helpers and cohesive
 * subsystems live in sibling modules; the async bootstrap runs as the `phases/`
 * sequence. The public handle and the `frameRef` / `handleRef`
 * boxes stay inline because those phases write them through the `{current}` pattern.
 */

import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineComposition } from '../../@types/engine/EngineComposition';
import type { Layer } from '../../@types/engine/layer/Layer';
import type { EngineState } from '../../@types/engine/state/EngineState';

import { seedCameraRuntime } from './camera/seedCameraRuntime';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from './camera/cameraFraming';
import { liveUpBasisQuat } from './camera/liveUpBasisQuat';
import type { CubemapCaptureRuntimes } from '../../@types/engine/state/CubemapCaptureRuntimes';
import { CUBEMAP_CAPTURES } from '../../data/rendering/cubemapCaptures';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { createLabel2DDirector } from './subsystems/label2DDirector';
import { COSMO_LABEL_DIRECTOR } from '../../data/labels/cosmoLabelDirectorConfig';
import { FOREGROUND_LABEL_DIRECTOR } from '../../data/labels/foregroundLabelDirectorConfig';
import { createStructureFocusSubsystem } from './subsystems/structureFocusSubsystem';
import { createClipPlayer } from './subsystems/clipPlayer';
import { createClipPathInspector } from './subsystems/clipPathInspector';
import { FLAT_TERRAIN } from '../../data/camera/flatTerrain';
import { FRAME_ORDER } from './frame/frameOrder';
import { FRAME_ORDER_PASS_NAMES } from './frame/frameOrderPassNames';
import { computeTimingSlotName } from './frame/timing/computeTimingSlotName';
import { liveWorldPose } from './helpers/liveWorldPose';
import { waitUntilSettled } from './helpers/waitUntilSettled';
import { deriveBodyStates } from './frame/deriveBodyStates';
import { cameraDebugSnapshotOf } from './camera/cameraDebugSnapshotOf';
import { readOrientDeltas } from './camera/orientDeltas';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { selectTimeState } from '../../state/time/selectors';
import { engineStatusChanged } from '../../state/engine/engineSlice';
import type { AssetSlot } from '../../@types/loading/AssetSlot';

import { runBootstrapPhases } from './phases/bootstrap';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';
import { destroyGpuHandles } from './gpuHandles/destroyGpuHandles';
import { GPU_HANDLE_ROWS } from './gpuHandles/gpuHandleRegistry';
import { updateFrameStats, IDLE_GAP_MS } from '../../utils/perf/updateFrameStats';
import { PriorityQueue } from '../../utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../utils/concurrency/assetQueueConcurrency';
import type { FrameStats } from '../../@types/engine/FrameStats';
import { EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT } from './subsystems/surfaceTileStream';
import { EMPTY_GPU_MEMORY_SNAPSHOT } from '../gpu/memory/trackGpuMemory';
import { makeReconcileEffects } from './wiring/makeReconcileEffects';
import { assetPriorityBySlotName } from './wiring/assetPriorityBySlotName';
import { createPlayClip } from './animation/playClip';
import { createClipPathInspectSeam } from './animation/computeClipPath';
import { composeSelectionRows } from './selection/composeSelectionRows';
import { hasUrlGate } from '../../utils/url/hasUrlGate';

/**
 * Start the WebGPU engine on `canvas`. Returns a handle synchronously; async setup
 * (GPU init, data loading) progresses in the background and reaches the UI through
 * `engineStatusChanged` dispatches — including failures, so this never throws.
 */

export function createEngine(
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
  composition: EngineComposition<readonly Layer<string, unknown>[]>,
): EngineHandle {
  // The scheduler needs `onFrame` now but the real body lands at `startLoop`; it
  // calls through `frameRef`. A ref, not a `let`: the phases are sibling modules.
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
    state: cb.store.getState(),
    projection: { fovYRad: 0, aspect: 1, near: NEAR_CLIP_MPC, far: FAR_CLIP_MPC },
  });

  // One bake-bookkeeping entry per capture row, seeded per kind; that kind's
  // scheduler is the sole writer thereafter. A sky row starts at Infinity, not
  // 0: far outside every band pre-boot, so a row's hysteresis margin can't
  // mistake "never measured" for "just closed".
  const cubemapCaptures = Object.fromEntries(
    Object.entries(CUBEMAP_CAPTURES).map(([key, row]) => [
      key,
      row.kind === 'sky'
        ? {
            lastBandActive: false,
            lastAnchorDistanceMpc: Number.POSITIVE_INFINITY,
            bakedSettings: null,
            bakedContentVersion: null,
          }
        : { subject: null, refreshedAtMs: new Map<string, number>(), due: false },
    ]),
  ) as CubemapCaptureRuntimes;

  const store = cb.store;

  const state: EngineState = {
    // These getters delegate straight to the store: sagas and sub-handle
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
    get ui() {
      return store.getState().ui;
    },
    picking: {
      // Pick-throttle state only; hover/select live on the Redux `selection` slice.
      pickInFlight: false,
      cursorTexPx: null,
    },
    gpu: {
      // Null until the async bootstrap constructs each; released in `destroy()`. See
      // `@types/EngineGpuHandles.d.ts` for the lifecycle.
      pickProgram: null,
      // Canonical bind-group layouts shared by every renderer's createPipelineLayout
      // (the layout:'auto' trap: services/gpu/bindGroupLayouts/fadeUniforms.ts).
      fadeBgl: null,
      sourceBgl: null,
      focusBgl: null,
      focusUniform: null,
      renderTargets: null,
      compositor: null,
      envBrdfLut: null,
      memory: null,
      // Read by buildSwapRenderers to rebuild the swap-format renderers on a later
      // format change without re-threading bootstrap deps.
      fontAtlases: null,
      uiCtx: null,
      labelRendererCosmo: null,
      markerLineRendererCosmo: null,
      labelRendererNear: null,
      markerLineRendererNear: null,
      labelPickRendererCosmo: null,
      labelPickRendererNear: null,
      debugLineRenderer: null,
      selectionRingRenderer: null,
      horizonShellRenderer: null,
      label3DRenderer: null,
      // Every bloom content layer's enable gate is exactly `bloomPyramid !== null`,
      // so a null handle silently drops the whole bloom sub-program.
      bloomPyramid: null,
      pickDebugOverlay: null,
      // Lit triangle-mesh bodies attached to a host body's slab;
      // the mesh slot family's commit/onRelease call its setMesh/clearMesh.
      meshBodyRenderer: null,
      cubeFaceBlitRenderer: null,
      domeResampleRenderer: null,
      bodyPickRenderer: null,
      orbitTrailRenderer: null,
      // The one exception to the null rule: always non-null, a no-op stub until
      // initGpu swaps in the device-aware service. Consumers gate on `.enabled`.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      surfaceTiles: null,

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

      clipPathInspector: createClipPathInspector(),

      // Eager, not a deferred shim: a shim captured by reference would break hover-pick
      // on the first frames. `onFrame` is the single per-frame chokepoint, so frame-stats
      // timing wraps this one site.
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

      fades: createFadeRegistry({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // Bounds concurrent boot fetches — see `ASSET_QUEUE_CONCURRENCY` for why 2,
      // not the thumbnail queue's `MAX_CONCURRENT_FETCHES`.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),

      pickDriver: null,
      resizeWake: null,
      loadProgress: null,
    },
    booted: false,
    fadesAnimating: false,
    cameraRuntime,
    cubemapCaptures,
    contentVersion: 0,
    // `renderFrame`/`runFrame` look this up via VIEW_RIGS. The only URL read for
    // the rig — see the `canvas.dataset.viewRig` stamp below, its sole consumer.
    viewRig: hasUrlGate('dome') ? 'dome' : 'mono',
    // Both empty until `createLayers` runs. `selectionKindRows` is not `selectionRows`:
    // that getter, above, is the unrelated saga display cache.
    layers: [],
    layerSagaTasks: [],
    selectionKindRows: [],
    // Static per Layer; the `renderTargets` row reads it and constructs BEFORE `createLayers`.
    layerTargets: composition.layers.map((layer) => layer.targets ?? []),
    // Empty until `createLayers` composes core's rows with every Layer's.
    passes: [],
    computes: [],
    planners: [],
    assetRows: [],
    slotsByKey: new Map(),
    slabRows: [],
    visibilityEntries: [],
    visibilityGates: new Map(),
    label3DProducers: [],
    orbitTrailGroups: [],
    terrain: FLAT_TERRAIN,
  };

  // React doesn't own this attribute, so it survives re-renders; `global.css`'s
  // `#c[data-view-rig='dome']` rule reads it to square the canvas.
  canvas.dataset.viewRig = state.viewRig;

  // One instance feeds both the dev panel and the load-progress emitter, so the
  // loading bar and the panel agree on what is in flight.
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.store.dispatch(engineStatusChanged({ kind: 'initializing' }));

  // Null here — the handle is declared after the IIFE below. `wireInput` reads it
  // lazily, so it is non-null by the time a user can physically double-click.
  const handleRef: { current: EngineHandle | null } = { current: null };

  // Every runner below is registered in ONE `setSagaContext` call before the async
  // GPU bootstrap finishes, which is safe only because each closure dereferences
  // its engine resources lazily, at call time.

  // Every selection kind is a Layer's: `state.selectionKindRows` starts empty and
  // createLayers fills it once, in tuple order. `selection` reads it lazily (never
  // rebuilds a list), so a deep link or the home ref seen before createLayers
  // resolves nothing yet and waits on the engineStatusChanged pulse
  // (resolveFocusRefDeferringSaga, watchSelectionRowsSaga's gap-fill).
  const selection = composeSelectionRows(
    () => state.selectionKindRows,
    () => state.settings.picking.kinds,
  );
  const bootstrapDeps: BootstrapDeps = {
    canvas,
    cb,
    composition,
    frameRef,
    handleRef,
    allSlots,
    selection,
  };

  // The single clip-run seam the saga context exposes.
  const playClip = createPlayClip({
    store,
    clipPlayer: state.subsystems.clipPlayer,
    // The drawn lens rides as `fov`, so a `fov` track starts from what is on screen.
    getLivePose: () => ({
      ...liveWorldPose(state),
      fov: state.cameraRuntime.outputs.projection.fovYRad,
    }),
  });

  // `sampleCount` must cover the WAYPOINT-DENSEST clip: ~200 waypoints at 384 samples
  // is ~1.9 per leg, drawing raw CHORDS that hide the spline. 4000 is ~20 per leg and
  // fits debugLineRenderer's maxLines (2·(n−1) + 9 gizmo = 8007 against 8192).
  const clipPathInspect = createClipPathInspectSeam({
    inspector: state.subsystems.clipPathInspector,
    getLivePose: () => liveWorldPose(state),
    sampleCount: 4000,
  });

  cb.setSagaContext({
    nextFrame: () => state.subsystems.scheduler.nextFrame(),
    reconcile: makeReconcileEffects(state, canvas),
    selection,
    // The up-basis quaternion is resolved THIS frame, so a mid-slerp re-switch
    // captures the live pole rather than snapping to the committed frame. Null
    // pre-bootstrap and post-destroy, so a saga no-ops rather than seeding stale.
    cameraRuntime: () =>
      state.booted
        ? {
            from: liveWorldPose(state),
            fovYRad: state.cameraRuntime.outputs.projection.fovYRad,
            aspect: state.cameraRuntime.outputs.projection.aspect,
            upBasisQuat: liveUpBasisQuat(state.cameraRuntime),
          }
        : null,
    playClip,
    clipPathInspect,
    home: composition.home,
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

  function destroy(): void {
    // Order matters for the first two groups only: the render loop stops before anything
    // it touches is torn down, and DOM listeners detach before their subsystems. Layers
    // go before core, in reverse tuple order: a captured core object (e.g. `focusUniform`)
    // must outlive the Layer's `destroy`.
    state.subsystems.scheduler.destroy();
    state.subsystems.assetQueue.destroy();

    state.subsystems.resizeWake?.destroy();
    state.subsystems.resizeWake = null;
    // Undefined only if the GPU IIFE errored before registering the HDR-capability
    // matchMedia listener — `phaseLocals` is assigned immediately after it.
    bootstrapDeps.phaseLocals?.unwatchHdrCapability();

    // Cancelled before a Layer's own `destroy` runs: a still-live saga could
    // otherwise dispatch into a half-destroyed Layer (see `RunSaga`'s doc comment).
    for (const task of state.layerSagaTasks) task.cancel();
    state.layerSagaTasks = [];
    for (const instance of state.layers.slice().reverse()) instance.destroy();
    state.layers = [];

    state.subsystems.cosmoLabelDirector.destroy();
    state.subsystems.foregroundLabelDirector.destroy();
    state.subsystems.structureFocus.destroy();
    // Owns two tile atlases once engaged, which WebGPU never releases on GC.
    state.subsystems.surfaceTiles?.stream.destroy();
    state.subsystems.surfaceTiles = null;
    state.subsystems.pickDriver?.destroy();
    state.subsystems.pickDriver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // WebGPU buffers/textures don't release via JS GC, so destroy() is mandatory.
    // The walk is REVERSED because registry declaration order is construction order
    // — so `focusUniform` is destroyed last, after the pick renderer that captured
    // its bind group at construction.
    destroyGpuHandles(GPU_HANDLE_ROWS, state);
    state.gpu.fontAtlases = null;
    state.gpu.uiCtx = null;
    // The LUT does own one, and it is no row, so nothing else releases it.
    state.gpu.envBrdfLut?.destroy();
    state.gpu.envBrdfLut = null;
    state.gpu.memory = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();

    state.booted = false;
  }

  // The engine's only public surface: imperative operations only — store writes go
  // direct to the store.
  const handle: EngineHandle = {
    nextFrame: () => state.subsystems.scheduler.nextFrame(),
    settled: () =>
      waitUntilSettled(
        () => state.subsystems.scheduler.nextFrame(),
        () => state.fadesAnimating,
      ),
    debug: {
      // The Map the bootstrap populates, so the dev panel sees slots as they appear.
      assetSlots: allSlots,
      // A getter, not a copied reference: initGpu assigns `state.gpu.timingService`
      // AFTER this literal is built, so a copy would be null forever.
      get timingService() {
        return state.gpu.timingService;
      },
      requestRender: () => state.subsystems.scheduler.requestRender(),
      // `idle` is derived, not stored, from the wall-clock gap since the last frame,
      // so a sleeping render-on-demand loop reads "idle" rather than a stale fps.
      frameStats: (): FrameStats => ({
        fps: Math.round(frameStats.fps),
        cpuMs: frameStats.cpuMs,
        idle:
          frameStats.lastStartMs === 0 || performance.now() - frameStats.lastStartMs > IDLE_GAP_MS,
      }),
      // Prelude compute steps first: GPU work no render toggle could reach.
      passOverrides: {
        allNames: [
          ...FRAME_ORDER.filter((step) => step.kind === 'compute').map((step) =>
            computeTimingSlotName(step.name, 'canvas'),
          ),
          ...FRAME_ORDER_PASS_NAMES,
        ],
      },
      // Re-derived per call, not snapshotted: the slots this joins against are
      // minted by the async bootstrap.
      assetPriorities: () => assetPriorityBySlotName(state),
      // Residency from the stream, the rest from this frame's plan.
      surfaceTiles: () => {
        const tiles = state.subsystems.surfaceTiles;
        if (tiles === null) return EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT;
        const { lastPlan, cut, subCamera } = tiles.plan;
        const plan = lastPlan === null ? null : { ...lastPlan, cutCount: cut.length };
        return { ...tiles.stream.debugStats(), plan, subCamera };
      },
      gpuMemory: () => state.gpu.memory?.() ?? EMPTY_GPU_MEMORY_SNAPSHOT,
      // An off-frame read that never writes camera state, so it goes through
      // `liveWorldPose` + `deriveBodyStates` at `outputs.simDays`. `liveSimDays`
      // alone resolves fresh — it is what the epoch-mismatch check compares against.
      cameraDebug: () => {
        const rootState = store.getState();
        const time = selectTimeState(rootState);
        const { register, gesture, tilt, outputs } = state.cameraRuntime;
        const bodyStates = deriveBodyStates(outputs.simDays);
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
          gesture: gesture.value?.gesture ?? null,
          rememberedTiltRad: tilt.rememberedTiltRad,
          tuning: rootState.camera.tuning,
          deltas: readOrientDeltas(),
          terrainHeightAt: state.terrain.heightAt,
          residentHeightLevelAt: state.terrain.residentHeightLevelAt,
          // Null unless the `terrain-pick-marker` overlay is on — its listener
          // is the only writer, so the pick row is dead with the toggle off.
          cursorTexPx: state.picking.cursorTexPx,
          viewportPx: [canvas.width, canvas.height],
          // What the last frame DREW with (`FrameOutputs`), the same rule this
          // whole snapshot follows — a mid-poll resize must not retro-change it.
          fovYRad: outputs.projection.fovYRad,
        });
      },
    },

    destroy,
  };

  handleRef.current = handle;

  return handle;
}
