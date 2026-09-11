/**
 * runFrame — the per-frame body of the render loop; `engine.ts` constructs the
 * deps (`RunFrameDeps`), this module consumes them. The clip tick is the FIRST
 * statement by contract. Then: the sim instant and body snapshot →
 * `stepCameraRuntime` (the camera as one pure step over the frame's ONE store
 * snapshot) → THE one `state.cameraRuntime` assignment → the step's actions,
 * in order → the frame context, the planners, the GPU dispatch and the
 * keep-ticking vote. Non-camera dispatches (scale bar, body distance) stay here.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';

import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { orientDeltasWatched, recordOrientDeltas } from '../camera/orientDeltas';
import { stepCameraRuntime } from '../camera/stepCameraRuntime';
import { cameraDofAnglesOf } from '../../../utils/camera/cameraDofAnglesOf';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { runMarkerProducers } from './runMarkerProducers';
import { runLabel3DProducers } from './runLabel3DProducers';
import { deriveFrameContext } from './frameContext';
import { deriveBodyStates } from './deriveBodyStates';
import { sceneBodyStates } from './sceneBodyStates';
import { earthSurfaceTier } from './earthSurfaceTier';
import { prepareStarCut } from './passes/starCatalogPass';
import { prepareBodySurfaceFrame, earthPass } from './passes/earthPass';
import { slabViewOf } from './slabs';
import { cutSurfaceTiles } from '../../../utils/scene/cutSurfaceTiles';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { drawPickDebugOverlay } from './drawPickDebugOverlay';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { computeScaleInfo } from '../helpers/scaleBar';
import { engineScaleChanged, engineBodyDistanceReported } from '../../../state/engine/engineSlice';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { selectTimeState, selectIsLiveTicking } from '../../../state/time/selectors';
import { throttleByTime } from '../../../utils/throttle/throttleByTime';
import { distanceMpc } from '../../../utils/math/distanceMpc';

/**
 * Scale-bar width, CSS px. Must stay under the ScaleBar panel's ~145 px content
 * box (it hugs the TimeBar pill; see ScaleBar.module.css) or the legend clamps.
 */
const SCALE_TARGET_PX = 120;

/**
 * ~4 Hz gate for the InfoCard's live distance row. Module scope on purpose: a
 * per-frame `throttleByTime(250)` would reset its closure and defeat itself.
 */
const publishBodyDistanceGate = throttleByTime(250);

/**
 * Idle-tick cadence for a LIVE sim clock, ms. The terminator sweeps 0.00417°·T
 * of ground per tick; at the 127 km tile standoff the viewport spans ~147 km, so
 * a 3 s tick is a visible ~8 px jump on a 900 px canvas — 500 ms holds it under
 * 1.5 px at every altitude. A one-shot `requestIdleFrame`, not `setInterval`:
 * an interval fires unconditionally and double-schedules against real wakes.
 */
const LIVE_IDLE_TICK_MS = 500;

/** `nowMs` is `performance.now()`-shaped, passed in so tests drive the timing. */
export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  // First statement, by contract: scene cues fired here (fade / show / hide /
  // focus) are in the store before this frame derives masks, demand or the pose,
  // and a frameTween a cue dispatches is seen by this frame's basis.
  const { clipEpoch } = state.subsystems.clipPlayer.tick(state.cameraRuntime.epochs.clip, nowMs);

  // The masks are a per-frame projection of settings + fade opacity, never a
  // hand-maintained mirror; demand itself reads settings directly.
  const masks = deriveSourceMasks(state);
  reevaluateDemand(state);

  // `reconcile` runs unconditionally (canvas size AND every state-driven scale
  // feed it) and reallocates only rows whose pixel size moved; `renderTargets`
  // is null until initGpu. The resize is the backing store's side effect, not
  // the camera's; the step is handed the aspect it produced.
  resizeCanvasToDisplay(deps.canvas);
  state.gpu.renderTargets?.reconcile(state, {
    width: deps.canvas.width,
    height: deps.canvas.height,
  });

  state.gpu.milkyWayCloud?.reconcile(state.settings.milkyWay.starCount);

  // The frame's ONE store snapshot. The camera step runs before
  // `deriveFrameContext` so a camera-only-ready frame still makes motion
  // progress before the missing-GPU early return.
  const steps = state.subsystems.inputAggregator.drain();
  const stored = deps.cb.store.getState();

  // The sim instant is derived BEFORE the step: the follow driver aims at where
  // the body is this frame, and `deriveBodyStates` is memoised one-deep, so
  // this call primes the map every later reader gets by reference.
  const simDays = deriveSimDays(selectTimeState(stored), nowMs);
  const bodyStates = deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>;

  const {
    next,
    actions,
    requestRender,
    world: worldPose,
    rootState,
  } = stepCameraRuntime(state.cameraRuntime, {
    nowMs,
    simDays,
    rootState: stored,
    canvasPx: [deps.canvas.clientWidth || 1, deps.canvas.clientHeight || 1],
    aspect: deps.canvas.width / deps.canvas.height,
    steps,
    bodies: bodyStates,
    clipEpoch,
    drivers: deps.drivers,
  });
  // The runtime is installed BEFORE any action reaches the store (ruled): a
  // listener fired by a commit sees this frame's register, not last frame's.
  state.cameraRuntime = next;
  for (const action of actions) deps.cb.store.dispatch(action);
  if (requestRender) state.subsystems.scheduler.requestRender();

  const { displayed: renderPose, projection, upBasis } = next.outputs;
  const poseBasis = ORIENTATION_FRAMES[stored.settings.orientation];
  const pivotFocus = stored.selectionRows.focus;

  // The debug panel's Δ/peak columns, at FRAME rate: its 4 Hz poll averages
  // ~15 frames into one reading, which is precisely how a per-frame decay
  // passes for a per-notch one. Gated on the panel being mounted — the
  // derivation walks the body roster, which nobody who never opens it pays for.
  if (orientDeltasWatched()) {
    recordOrientDeltas(
      cameraDofAnglesOf({
        storedFrame: rootState.camera.base.frame,
        worldPose,
        poseBasis,
        upBasis,
        bodyStates,
        rememberedTiltRad: next.surface.rememberedTiltRad,
        tuning: rootState.camera.tuning,
      }),
      nowMs,
    );
  }

  // `clientWidth`/`clientHeight` are CSS px; backing-store `width`/`height`
  // silently breaks the bar on retina.
  if (state.booted) {
    const snap = {
      distance: worldPose.distance,
      fovYRad: projection.fovYRad,
    };
    const scaleInfo = computeScaleInfo({
      cam: snap,
      canvasSize: { width: deps.canvas.clientWidth, height: deps.canvas.clientHeight },
      targetPx: SCALE_TARGET_PX,
      pivotRadiusMpc: pivotRadiusMpc(pivotFocus),
    });
    if (scaleInfo !== null) {
      deps.cb.store.dispatch(engineScaleChanged(scaleInfo));
    }
  }

  // The 'not ready' branch is the window before cam + GPU handles populate.
  const ctx = deriveFrameContext(
    state,
    deps.canvas,
    worldPose,
    renderPose,
    projection,
    poseBasis,
    upBasis,
    masks.draw,
    nowMs,
    simDays,
  );
  if (!ctx.isReady) {
    // Bootstrap populates the handles without waking any channel: keep polling.
    state.subsystems.scheduler.requestRender();
    return;
  }

  // `produceFocusUniforms(nowMs)` TICKS the focus fade, so it runs EXACTLY ONCE
  // per frame, before every consumer of the blend (label director, markers,
  // render settings); all of them read the captured value, never a fresh call.
  const focusRow = state.selectionRows.focus;
  const focusedStructure = focusRow !== null && focusRow.type === 'structure' ? focusRow : null;
  state.subsystems.structureFocus.update(focusedStructure, nowMs);
  const focusUniforms = state.subsystems.structureFocus.produceFocusUniforms(nowMs);
  ctx.focusBlend = focusUniforms.blend;
  ctx.focus = focusUniforms;

  // Camera→focused-body distance for the InfoCard (the store-boundary rule:
  // React never reads the engine snapshot). Null unless an orbital body in this
  // frame's snapshot is focused.
  if (publishBodyDistanceGate(nowMs)) {
    let focusedBodyDistanceMpc: number | null = null;
    if (focusRow !== null && focusRow.type === 'body') {
      const bodyState = sceneBodyStates(state, ctx).get(focusRow.id);
      if (bodyState !== undefined) {
        focusedBodyDistanceMpc = distanceMpc(ctx.drawCamPos, bodyState.positionMpc);
      }
    }
    deps.cb.store.dispatch(engineBodyDistanceReported(focusedBodyDistanceMpc));
  }

  // hiResFamous must run BEFORE the shared disk walk: the textured-disk body
  // folds `hiResFamous.lastOutput.byFamousIdx` into the instances it emits;
  // after would lag a frame and flicker on close approach.
  if (state.subsystems.hiResFamous !== null) {
    state.subsystems.hiResFamous.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
      famousGalaxiesMeta: state.famousGalaxiesMeta,
    });
  }
  // ONE catalog walk feeds both disk planners (LOD-1 procedural, then LOD-2
  // textured); each `beginFrame` returns the visitor the walk drives.
  const { proceduralDisks, texturedDisks, diskPlannerWalk } = state.subsystems;
  if (proceduralDisks !== null && texturedDisks !== null && diskPlannerWalk !== null) {
    const sharedInput = {
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
    };
    diskPlannerWalk.runFrame(
      sharedInput,
      proceduralDisks.beginFrame({
        ...sharedInput,
        sbScale: state.settings.galaxyCatalogs.sbScale,
        sbMax: state.settings.galaxyCatalogs.sbMax,
        brightness: state.settings.galaxyCatalogs.brightness,
      }),
      texturedDisks.beginFrame({
        ...sharedInput,
        famousGalaxiesMeta: state.famousGalaxiesMeta,
        nowMs: ctx.nowMs,
      }),
    );
  }

  // The tile planner keys off Earth's OWN slab row (no row = already culled)
  // and the layer's own `enabled`, so tiles and layer never disagree about
  // whether Earth is on screen.
  const earthTiles = state.subsystems.earthTiles;
  const earth = state.data.bodies.earth;
  const earthSlab = ctx.slabs.find(
    (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === 'earth',
  );
  if (earthTiles !== null && earth !== null && earthSlab !== undefined) {
    // The same slab view `earthPass.draw` samples into.
    const earthTilesView = slabViewOf(ctx, earthSlab.index);
    if (earthPass.enabled(state, ctx, earthTilesView)) {
      // The tier off the COMMITTED texture slot, so a swap in flight cannot make
      // the planner believe in detail that is not on the GPU yet.
      const params = earthTiles.plannerParams(earthSurfaceTier(state));
      // `setLastCut` runs unconditionally so a tier swap in flight draws
      // nothing stale rather than last frame's cut.
      let cut: readonly SurfaceCutTile[] = [];
      if (params !== null) {
        const prepared = prepareBodySurfaceFrame(state, ctx, earthTilesView);
        if (prepared !== null) {
          // One walk yields both the draw cut and the fetch requests.
          const result = cutSurfaceTiles({
            ...params,
            camPosLocalM: prepared.pose.eyeRelBodyM,
            viewProjLocal: prepared.mvpLocal,
            radiusM: prepared.radiusM,
            viewportPx: earthTilesView.viewportPx,
            residentSlot: earthTiles.residentSlot,
          });
          cut = result.cut;
          earthTiles.update({ plan: result.requests });
        }
      }
      earthTiles.setLastCut(cut);
    }
  }

  // Outside the gate: `isAnimating()` is true while the manifest is in flight,
  // before the layer can engage — voting only on engaged frames would sleep
  // the loop mid-fetch.
  const earthTilesAnimating = earthTiles?.isAnimating() ?? false;

  // Before the GPU dispatch (they upload the label buffers). Three statements,
  // not `a() || b() || c()`: each call FLUSHES as a side effect and `||`
  // short-circuits.
  const cosmoLabelsAnimating = state.subsystems.cosmoLabelDirector.runFrame(state, ctx);
  const nearLabelsAnimating = state.subsystems.foregroundLabelDirector.runFrame(state, ctx);
  const label3DAnimating = runLabel3DProducers(state, ctx);
  const labelsAnimating = cosmoLabelsAnimating || nearLabelsAnimating || label3DAnimating;

  // Primes the per-ctx star-cut memo the three star layers hit during dispatch
  // (the walk runs once) and surfaces `anyNodeFading` for the wake vote; null
  // when the star pass is not live.
  const starCut = prepareStarCut(state, ctx);

  // Before the GPU dispatch: uploads the instance buffer `structureMarkersPass` reads.
  if (state.gpu.structureMarkerRenderer !== null) {
    state.gpu.structureMarkerRenderer.setMarkers(runMarkerProducers(state, ctx));
  }

  renderFrame({
    ctx,
    state,
    device: deps.device,
    context: deps.context,
    timingService: deps.timingService,
  });

  // After the submit as a latency choice only; it owns its own encoder with
  // `loadOp: 'load'`. Hover picking is pointer-driven (hoverPickDriver).
  drawPickDebugOverlay(state, deps);

  // Render-on-demand. Tick the FadeRegistry BEFORE the predicate reads
  // isAnyAnimating: tick is the single resolution site for fadeTo promises, so
  // without it awaited fade-outs (catalog visibility, tier swaps) hang forever.
  state.subsystems.fades.tick(nowMs);
  const keepTicking = shouldKeepTicking(state, rootState, nowMs, {
    starFadeAnimating: starCut?.anyNodeFading ?? false,
    earthTilesAnimating,
    labelsAnimating,
  });

  if (keepTicking) {
    state.subsystems.scheduler.requestRender();
  } else if (selectIsLiveTicking(rootState)) {
    // At rest with a live sim clock: a coarse heartbeat (see LIVE_IDLE_TICK_MS)
    // the scheduler ignores while a frame is already queued.
    state.subsystems.scheduler.requestIdleFrame(LIVE_IDLE_TICK_MS);
  }
}
