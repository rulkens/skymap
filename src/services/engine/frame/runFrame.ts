/**
 * runFrame — the per-frame body of the render loop; `engine.ts` constructs the
 * deps (`RunFrameDeps`), this module consumes them. The camera steps run in
 * this exact order: (0) drain input, (1) produce from the driver table, (2)
 * tween completion, (3) commit-on-edge, (3b) pivot-pin, (3c) THE FOLD (world
 * arm resolved once, regime normalised), (4) update the pose Resources —
 * AUTHORED pose to `lastPose`, projected pose to `displayedPose`. The clock is
 * advanced exactly once per frame, by step 1. Then the frame context, the
 * planners, the GPU dispatch and the keep-ticking vote.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';

import { drainInput } from './drainInput';
import { runCameraDrivers } from '../camera/cameraDrivers';
import { activeDriverId } from '../camera/activeDriverId';
import { applyFocusedBodyPivot } from '../camera/applyFocusedBodyPivot';
import { approachTiltedPose } from '../camera/approachTiltedPose';
import { resolveWorldArm, toBodyArm } from '../camera/poseFrameConversion';
import { regimeArmFor } from '../camera/regimeArmFor';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { tweenElapsed, frameTweenElapsed } from '../camera/cameraClock';
import { resolveFrameBasis } from '../camera/resolveFrameBasis';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { runMarkerProducers } from './runMarkerProducers';
import { runLabel3DProducers } from './runLabel3DProducers';
import { deriveFrameContext } from './frameContext';
import { deriveBodyStates } from './deriveBodyStates';
import { sceneBodyStates } from './sceneBodyStates';
import { earthSurfaceTier } from './earthSurfaceTier';
import { prepareStarCut } from './passes/starCatalogLayer';
import { prepareBodySurfaceFrame, earthLayer } from './passes/earthLayer';
import { slabViewOf } from './slabs';
import { cutSurfaceTiles } from '../../../utils/scene/cutSurfaceTiles';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { drawPickDebugOverlay } from './drawPickDebugOverlay';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import {
  commitCameraPose,
  cancelCameraTween,
  clearFrameTween,
} from '../../../state/camera/cameraSlice';
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
  // focus) are in the store before this frame derives masks, demand or the pose.
  state.subsystems.clipPlayer.tick(nowMs);

  // The masks are a per-frame projection of settings + fade opacity, never a
  // hand-maintained mirror; demand itself reads settings directly.
  const masks = deriveSourceMasks(state);
  reevaluateDemand(state);

  // `reconcile` runs unconditionally (canvas size AND every state-driven scale
  // feed it) and reallocates only rows whose pixel size moved; `renderTargets`
  // is null until initGpu.
  if (resizeCanvasToDisplay(deps.canvas)) {
    state.cameraRuntime.projection.aspect = deps.canvas.width / deps.canvas.height;
  }
  // The FOV slider can change on any frame with no resize event.
  state.cameraRuntime.projection.fovYRad = state.settings.camera.fovDeg * (Math.PI / 180);
  state.gpu.renderTargets?.reconcile(state, {
    width: deps.canvas.width,
    height: deps.canvas.height,
  });

  state.gpu.milkyWayCloud?.reconcile(state.settings.milkyWay.starCount);

  // (0) Above the `getState()` below so the gesture edges it dispatches are in
  // the snapshot the driver table resolves against.
  drainInput(state, deps, nowMs);

  // The camera steps run before `deriveFrameContext` so a camera-only-ready
  // frame still makes motion progress before the missing-GPU early return.
  const rootState = deps.cb.store.getState();

  // The sim instant is derived BEFORE produce: the follow driver aims at where
  // the body is this frame, and `deriveBodyStates` is memoised one-deep, so
  // this call primes the map every later reader gets by reference. Bound to a
  // local only because the fold needs it by value.
  const simDays = deriveSimDays(selectTimeState(rootState), nowMs);
  const bodyStates = deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>;

  // Single-writer epoch the pick path reads — NOT the derive memo's key, which
  // a between-frames `deriveBodyStates(CONST_J2000)` (extractSelectionRow) can
  // repoint.
  state.cameraRuntime.lastRenderedSimDays.current = simDays;

  // (1) The one clock advance per frame.
  const pose = runCameraDrivers(deps.drivers, rootState, state.cameraRuntime.clock, nowMs);
  const activeId = activeDriverId(deps.drivers, rootState);

  // `poseBasis` is the COMMITTED frame — the saga writes the destination into
  // `settings.orientation` when a switch starts, so the eye holds still through
  // a roll and only up rotates (`upBasis`, the live B(t)). The Resource gets
  // `upBasis`, NOT `poseBasis`: it seeds the next switch's `fromQuat`, and a
  // re-switch mid-roll must compose from the live pole.
  const poseBasis = ORIENTATION_FRAMES[rootState.settings.orientation];
  const upBasis = resolveFrameBasis(
    rootState.settings.orientation,
    rootState.camera.frameTween,
    state.cameraRuntime.clock,
    nowMs,
  );
  state.cameraRuntime.upBasis.current = upBasis;

  // Re-calling `frameTweenElapsed` is safe: the ref is unchanged, so the reset
  // branch does not fire. `EASE` clamps, so this frame's basis is already the
  // destination; clearing only affects the next frame's getState.
  if (rootState.camera.frameTween !== null) {
    const rollElapsed = frameTweenElapsed(
      state.cameraRuntime.clock,
      rootState.camera.frameTween,
      nowMs,
    );
    if (rollElapsed >= rootState.camera.frameTween.durationMs) {
      deps.cb.store.dispatch(clearFrameTween());
    }
  }

  // (2) After produce (the pose is already saturated at `to`) and before
  // commit-on-edge: the cancel lands next frame, when the tween deactivates and
  // the edge commits `lastPose` — exactly one commit, exactly at `to`.
  // Re-calling `tweenElapsed` is safe: same ref, so no clock reset.
  if (activeId === 'tween' && rootState.camera.tween !== null) {
    const elapsed = tweenElapsed(state.cameraRuntime.clock, rootState.camera.tween, nowMs);
    if (elapsed >= rootState.camera.tween.durationMs) {
      deps.cb.store.dispatch(cancelCameraTween());
    }
  }

  // (3) `lastPose.current` still holds the PREVIOUS frame's pose here (step 4
  // updates it), which is the saturated pose the departing driver must bake.
  // `orbitDrag` commits via `onGestureEnd`; `resting`'s pose IS base.
  const { lastPose, displayedPose, prevActiveId } = state.cameraRuntime;
  const prev = prevActiveId.current;
  // The SAME store snapshot the drivers resolved against, so the pin, the fold
  // and the winner never disagree on what is focused.
  const pivotFocus = rootState.selectionRows.focus;
  let renderPose = pose;
  // Non-null only on a non-pivoting edge: the register value for step 4 when
  // `renderPose` had to be the displayed box.
  let authoredOverride: FramedCameraPose | null = null;
  const pivotsOnFocusedBody =
    deps.drivers.find((d) => d.id === activeId)?.pivotsOnFocusedBody ?? false;
  const prevRow = deps.drivers.find((d) => d.id === prev);
  if (prev !== activeId && prevRow?.commitsOnEdge) {
    // The AUTHORED register is committed verbatim (R12b-1; see
    // `commitCameraPose`'s invariant note).
    deps.cb.store.dispatch(commitCameraPose(lastPose.current));
    // Produce ran the INCOMING driver against the PRE-commit `base`, so a
    // base-reading driver would flash the pre-animation pose for one frame.
    // Which box overrides depends on the incoming driver (R12c-1): a pivoting
    // one re-derives the image below, so it gets the AUTHORED register (the
    // displayed box would be re-pinned — one frame of eye walk); a non-pivoting
    // one (clip/tween) would flash the untilted register ~0.4 rad to nadir, so
    // it renders the DISPLAYED box and the register is pinned to its authored
    // value.
    renderPose = pivotsOnFocusedBody ? lastPose.current : displayedPose.current;
    if (!pivotsOnFocusedBody) authoredOverride = lastPose.current;
  }

  // (3b) The pin SETS the target (never adds), so baking `renderPose` into
  // `base` on the next edge cannot double-apply the body translation. A pan
  // strafe rides `followPanOffset` (world frame) so the shifted pivot still
  // translate-follows the body.
  const clock = state.cameraRuntime.clock;
  renderPose = applyFocusedBodyPivot(
    renderPose,
    pivotsOnFocusedBody,
    pivotFocus,
    simDays,
    clock.followPanOffset,
  );
  // Post-pin, PRE-projection: the projection below reaches the register on no
  // path (R12b-1).
  let authoredPose = authoredOverride ?? renderPose;
  // The body the tilt memory belongs to: the ENGAGED one while a body arm holds
  // (a differing focus has already released it), else the FOCUSED one.
  const regimeFrame = rootState.camera.base.frame;
  state.cameraRuntime.surface.noteBody(
    regimeFrame !== 'absolute'
      ? regimeFrame.body
      : pivotFocus?.type === 'body'
        ? pivotFocus.id
        : null,
  );
  // The tilt projection (ruling 13) sits between the pin and the fold, so the
  // engage edge converts the image it already shows.
  renderPose = approachTiltedPose(
    renderPose,
    pivotsOnFocusedBody,
    pivotFocus,
    simDays,
    state.cameraRuntime.surface.rememberedTiltRad(),
    poseBasis,
    upBasis,
  );

  // (3c) THE FOLD, below every pose writer (spec §7 steps 5-6): a fold above
  // driver arbitration is discarded by whatever writes after it. `lastPose`
  // stays FRAMED; every world-Mpc reader takes this value.
  const worldPose = resolveWorldArm(renderPose, bodyStates, poseBasis, upBasis);

  // No flip during a gesture (ruled, Q6): skipped WHOLE — not clamped, not
  // latched — and re-evaluated at gesture end.
  if (!rootState.camera.dragging) {
    // `camera.base.frame` IS the regime (spec §4), not the arm this frame's
    // winner authored: `tween` and `clip` are not arm-gated, so the produced
    // pose would re-engage every frame of an animation inside the band.
    const regime = rootState.camera.base.frame;
    const eyeMpc = eyeMpcOf(worldPose, poseBasis);
    // The focused body constrains the regime (round 10).
    const arm = regimeArmFor(
      regime,
      eyeMpc,
      bodyStates,
      pivotFocus?.type === 'body' ? pivotFocus.id : null,
    );
    if (arm === 'absolute') {
      if (renderPose.frame !== 'absolute') {
        // Disengage commits target-at-centre, eye preserved: the pivot pin
        // re-reads an absolute `target` as the body's centre one frame later
        // and rebuilds the eye from `target + dir·distance`, so committing
        // `worldPose`'s on-ray surface target verbatim teleported the eye one
        // body radius inward (pop-2). Zoom-driven recessions cross at tilt 0,
        // so this is view-exact; other crossings re-aim by at most the
        // remaining tilt on the flip frame.
        const centreMpc = bodyStates.get(renderPose.frame.body)!.positionMpc;
        const toCentre: Vec3 = [
          centreMpc[0] - eyeMpc[0],
          centreMpc[1] - eyeMpc[1],
          centreMpc[2] - eyeMpc[2],
        ];
        const { yaw, pitch } = orbitAnglesLookingAlong(normalize3(toCentre), poseBasis as Mat3);
        renderPose = absoluteArm({
          target: [centreMpc[0], centreMpc[1], centreMpc[2]],
          yaw,
          pitch,
          distance: Math.hypot(toCentre[0], toCentre[1], toCentre[2]),
          roll: worldPose.roll,
        });
        // Centre-looking, so authored and displayed coincide.
        authoredPose = renderPose;
      }
    } else if (renderPose.frame === 'absolute') {
      // Total: `regimeArmFor` only names a body it resolved out of THIS map.
      const bodyState = bodyStates.get(arm.body)!;
      renderPose = {
        frame: arm,
        pose: toBodyArm(worldPose, poseBasis, upBasis, arm.body, bodyState),
      };
      // Engage converts the DISPLAYED pose (ruling 13); on the body arm the
      // tilt is geometry, not a projection, so the register holds it too.
      authoredPose = renderPose;
    }
    // Once per crossing. The wake is the fold's own: `shouldKeepTicking` reads
    // the pre-fold snapshot, so a flip that quiets the last live term would
    // otherwise park the loop.
    if ((arm === 'absolute' ? null : arm.body) !== (regime === 'absolute' ? null : regime.body)) {
      deps.cb.store.dispatch(commitCameraPose(renderPose));
      state.subsystems.scheduler.requestRender();
    }
  }

  // (4) After the commit, which reads the previous frame's values. The
  // authored/displayed split keeps the produce→pin→project loop dead (R12b-1).
  prevActiveId.current = activeId;
  lastPose.current = authoredPose;
  displayedPose.current = renderPose;

  // `clientWidth`/`clientHeight` are CSS px; backing-store `width`/`height`
  // silently breaks the bar on retina. `state.cam` is the bootstrap-ready proxy.
  if (state.cam) {
    const snap = {
      distance: worldPose.distance,
      fovYRad: state.cameraRuntime.projection.fovYRad,
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
    state.cameraRuntime.projection,
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
    // The same slab view `earthLayer.draw` samples into.
    const earthTilesView = slabViewOf(ctx, earthSlab.index);
    if (earthLayer.enabled(state, ctx, earthTilesView)) {
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

  // Before the GPU dispatch: uploads the instance buffer `structureMarkersLayer` reads.
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
