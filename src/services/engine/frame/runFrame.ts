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
import type { Vec2 } from '../../../@types/math/Vec2';

import { orientDeltasWatched, recordOrientDeltas } from '../camera/orientDeltas';
import { stepCameraRuntime } from '../camera/stepCameraRuntime';
import { cameraDofAnglesOf } from '../camera/cameraDofAnglesOf';
import { mainViewSpec } from '../../../utils/camera/mainViewSpec';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { runLabel3DProducers } from './runLabel3DProducers';
import { deriveFrameContext } from './frameContext';
import { deriveView } from './deriveView';
import { frameContextInputOf } from './frameContextInputOf';
import { frameBodyStates } from './frameBodyStates';
import { sceneBodyStates } from './sceneBodyStates';
import { renderFrame } from './renderFrame';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';
import { drawPickDebugOverlay } from './drawPickDebugOverlay';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { computeScaleInfo } from '../helpers/scaleBar';
import { engineScaleChanged, engineBodyDistanceReported } from '../../../state/engine/engineSlice';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { selectTimeState, selectIsLiveTicking } from '../../../state/time/selectors';
import { throttleByTime } from '../../../utils/throttle/throttleByTime';
import { cpuSpans } from '../../../utils/perf/cpuSpans';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { selectionDriver } from '../../../utils/selection/selectionDriver';
import { encodeSelectionPick } from '../../../utils/selection/encodeSelectionPick';
import { pendingToInputSteps } from '../../../utils/input/pendingToInputSteps';
import { selectPendingInput } from '../../../state/input/selectors';
import { inputConsumed } from '../../../state/input/inputSlice';

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
 * Idle-tick cadence for a LIVE sim clock, ms. At the 127 km tile standoff the
 * viewport spans ~147 km, so a 3 s tick is a visible ~8 px terminator jump on a
 * 900 px canvas; 500 ms holds it under 1.5 px. One-shot `requestIdleFrame`, not
 * `setInterval`, which double-schedules against real wakes.
 */
const LIVE_IDLE_TICK_MS = 500;

/** `nowMs` is `performance.now()`-shaped, passed in so tests drive the timing. */
export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  // First statement, by contract: cues fired here are in the store before this frame
  // derives demand or the pose, and a cue's frameTween is seen by this frame's basis.
  const { clipEpoch } = state.subsystems.clipPlayer.tick(state.cameraRuntime.epochs.clip, nowMs);

  reevaluateDemand(state);

  // `reconcile` runs unconditionally and reallocates only rows whose pixel size moved;
  // `renderTargets` is null until initGpu. The step is handed the aspect it produced.
  resizeCanvasToDisplay(deps.canvas);
  state.gpu.renderTargets?.reconcile(state, {
    width: deps.canvas.width,
    height: deps.canvas.height,
  });

  // The frame's ONE store snapshot. The camera step runs before `deriveFrameContext`
  // so a camera-only-ready frame still makes progress before the missing-GPU return.
  const stored = deps.cb.store.getState();
  const canvasPx: Vec2 = [deps.canvas.clientWidth || 1, deps.canvas.clientHeight || 1];
  const pending = selectPendingInput(stored);
  const steps = pendingToInputSteps(pending, canvasPx);

  // Derived BEFORE the step: the follow driver aims at where the body is this frame. The
  // ONE placement of the moving selection; the frame context takes this same Map.
  const simDays = deriveSimDays(selectTimeState(stored), nowMs);
  const bodyStates = frameBodyStates(stored, state.selectionKindRows, simDays);

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
    canvasPx,
    aspect: deps.canvas.width / deps.canvas.height,
    steps,
    bodies: bodyStates,
    terrainHeightAt: state.terrainHeightAt,
    clipEpoch,
    schemes: deps.controlSchemes,
  });
  // The runtime is installed BEFORE any action reaches the store (ruled): a
  // listener fired by a commit sees this frame's register, not last frame's.
  state.cameraRuntime = next;
  for (const action of actions) deps.cb.store.dispatch(action);
  // Same task as the read above, so no source dispatch can land in between.
  if (pending.length > 0) deps.cb.store.dispatch(inputConsumed());
  if (requestRender) state.subsystems.scheduler.requestRender();

  const upBasis = next.outputs.upBasis;
  const poseBasis = ORIENTATION_FRAMES[stored.settings.orientation];

  // The debug panel's Δ/peak columns at FRAME rate: its 4 Hz poll averages ~15 frames,
  // which lets a per-frame decay pass for a per-notch one. Gated on the panel being
  // mounted: the derivation walks the body roster.
  if (orientDeltasWatched()) {
    recordOrientDeltas(
      cameraDofAnglesOf({
        storedFrame: rootState.camera.base.frame,
        worldPose,
        poseBasis,
        upBasis,
        bodyStates,
        rememberedTiltRad: next.tilt.rememberedTiltRad,
        tuning: rootState.camera.tuning,
      }),
    );
  }

  // Shared with `pickFrameContext`; only the time, the bases and the body snapshot vary
  // between callers. Safe here because `state.cameraRuntime = next` above already
  // made `state`'s runtime THIS frame's.
  const { input, cam } = frameContextInputOf(state, {
    worldPose,
    nowMs,
    poseBasis,
    upBasis,
    simDays,
    bodyStates,
  });

  // `clientWidth`/`clientHeight` are CSS px; backing-store `width`/`height`
  // silently breaks the bar on retina.
  if (state.booted) {
    const scaleInfo = computeScaleInfo({
      cam: { distance: input.altitudeMpc, fovYRad: cam.fovYRad },
      canvasSize: { width: deps.canvas.clientWidth, height: deps.canvas.clientHeight },
      targetPx: SCALE_TARGET_PX,
    });
    if (scaleInfo !== null) {
      deps.cb.store.dispatch(engineScaleChanged(scaleInfo));
    }
  }

  // Minted here so `renderFrame` gets the SAME mutable `Set`; passes see only the
  // `ReadonlySet` on `snapshot.renderedTargets`.
  const renderedTargets = new Set<string>();
  // The 'not ready' branch is the window before cam + GPU handles populate.
  const snapshot = deriveFrameContext(state, input, renderedTargets);
  if (!snapshot.isReady) {
    // Bootstrap populates the handles without waking any channel: keep polling.
    state.subsystems.scheduler.requestRender();
    return;
  }

  // The frame's views, once (mono is `[canvas]`). `deriveView` reads no stamp, so it can
  // run ahead of focus/plans, and must run ahead of every planner row so each can walk
  // every view's frustum.
  const canvas = deriveView(
    snapshot,
    cam,
    mainViewSpec(cam, { width: deps.canvas.width, height: deps.canvas.height }),
  );
  // The rig hands back specs; deriving views HERE, off the one shared `snapshot`,
  // makes the shared-snapshot invariant structural.
  const viewSpecs = VIEW_RIGS[state.viewRig].views(canvas, state);
  const views =
    viewSpecs === null || viewSpecs.length === 0
      ? [canvas]
      : viewSpecs.map((spec) => deriveView(snapshot, cam, spec));

  // `produceFocusUniforms(nowMs)` TICKS the focus fade, so it runs EXACTLY ONCE
  // per frame, before every consumer of the blend (label director, markers,
  // render settings); all of them read the captured value, never a fresh call.
  const focusRow = state.selectionRows.focus;
  const focusedStructure = focusRow !== null && focusRow.type === 'structure' ? focusRow : null;
  state.subsystems.structureFocus.update(focusedStructure, nowMs);
  const focusUniforms = state.subsystems.structureFocus.produceFocusUniforms(nowMs);
  snapshot.focusBlend = focusUniforms.blend;
  snapshot.focus = focusUniforms;
  snapshot.focusPickId = encodeSelectionPick(
    state.selectionKindRows,
    state.subsystems.structureFocus.lastFocusRef(),
  );

  // Camera→focused-body distance for the InfoCard (the store-boundary rule:
  // React never reads the engine snapshot). Null unless an orbital body in this
  // frame's snapshot is focused.
  if (publishBodyDistanceGate(nowMs)) {
    let focusedBodyDistanceMpc: number | null = null;
    const focusId = selectionDriver(focusRow)?.poseId ?? null;
    if (focusId !== null) {
      const bodyState = sceneBodyStates(state, canvas).get(focusId);
      if (bodyState !== undefined) {
        focusedBodyDistanceMpc = distanceMpc(canvas.drawCamPos, bodyState.positionMpc);
      }
    }
    deps.cb.store.dispatch(engineBodyDistanceReported(focusedBodyDistanceMpc));
  }

  // Before the GPU dispatch (they upload the label buffers). Three statements,
  // not `a() || b() || c()`: each call FLUSHES as a side effect and `||`
  // short-circuits.
  const cosmoStartMs = cpuSpans.on ? performance.now() : 0;
  const cosmoLabelsAnimating = state.subsystems.cosmoLabelDirector.runFrame(state, canvas);
  if (cpuSpans.on) cpuSpans.add('labels:cosmo', cosmoStartMs);
  const nearStartMs = cpuSpans.on ? performance.now() : 0;
  const nearLabelsAnimating = state.subsystems.foregroundLabelDirector.runFrame(state, canvas);
  if (cpuSpans.on) cpuSpans.add('labels:near0', nearStartMs);
  const label3DAnimating = runLabel3DProducers(state, canvas);
  const labelsAnimating = cosmoLabelsAnimating || nearLabelsAnimating || label3DAnimating;

  renderFrame({
    canvas,
    views,
    state,
    device: deps.device,
    context: deps.context,
    timingService: deps.timingService,
    renderedTargets,
  });

  // After the submit as a latency choice only; it owns its own encoder with
  // `loadOp: 'load'`. Hover and select picks run in `createPickDriver`.
  drawPickDebugOverlay(state, deps);

  // Render-on-demand. Tick the FadeRegistry BEFORE the predicate reads
  // isAnyAnimating: tick is the single resolution site for fadeTo promises, so
  // without it awaited fade-outs (catalog visibility, tier swaps) hang forever.
  state.subsystems.fades.tick(nowMs);
  state.fadesAnimating = state.subsystems.fades.isAnyAnimating(nowMs) || labelsAnimating;
  const keepTicking = shouldKeepTicking(
    state,
    rootState,
    nowMs,
    {
      labelsAnimating,
      probeDue: state.cubemapCaptures.probe.due,
      // Read AFTER `renderFrame`: every planner row ran inside it.
      layersAwake: snapshot.plans.awake,
    },
    deps.controlSchemes[next.scheme].drivers,
  );

  if (keepTicking) {
    state.subsystems.scheduler.requestRender();
  } else if (selectIsLiveTicking(rootState)) {
    // At rest with a live sim clock: a coarse heartbeat (see LIVE_IDLE_TICK_MS)
    // the scheduler ignores while a frame is already queued.
    state.subsystems.scheduler.requestIdleFrame(LIVE_IDLE_TICK_MS);
  }
}
