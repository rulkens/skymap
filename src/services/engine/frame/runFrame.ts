/**
 * runFrame — the per-frame body of the render loop, kept in its own module so
 * `engine.ts` stays focused on bootstrap + the public handle.
 *
 * Engine.ts is responsible for *constructing* dependencies; runFrame.ts is
 * responsible for *consuming* them. The two concerns sit behind a single seam —
 * `RunFrameDeps` — which makes the inputs the body relies on legible at a glance.
 *
 * ### What counts as the 'frame body'
 *
 * Everything from the camera-driver resolve at the top to the `renderFrame()`
 * GPU dispatch and the `drawPickDebugOverlay` call that follows. The
 * still-animating predicate ('keep ticking ONLY if motion or async work is in
 * flight') lives here too — a single condition that fires
 * `scheduler.requestRender()` if any busy-flag is set.
 *
 * ### Why deps are passed explicitly instead of lifted to EngineState
 *
 * The IIFE-local `device` and `context` GPU handles are read *only* by the
 * frame body; promoting them to `state.gpu.*` would widen `EngineState`'s
 * contract for one consumer and force every other reader to null-check
 * fields it never touches.  They flow through `RunFrameDeps` instead.  Every
 * per-frame renderer (`milkyWayCloudRenderer`, `filamentRenderer`,
 * `texturedDiskRenderer`, …) DOES live on `state.gpu.*` already — every
 * `ContentLayer.draw` reads its renderer straight from there (see
 * `passes/index.ts`), so `RunFrameDeps` carries no renderer fields.
 *
 * ### Camera produce → commit-on-edge ordering
 *
 * The frame body runs four camera steps, in this exact order:
 *
 *   1. PRODUCE the pose from the driver table (single-writer, one pose per frame).
 *   2. TWEEN COMPLETION: if the tween driver won and its elapsed >= durationMs,
 *      dispatch `cancelCameraTween()`. The tween deactivates on the NEXT frame;
 *      this frame's pose is already == to exactly (saturation). No activeId change
 *      here — the commit fires on the next frame's deactivation edge.
 *   3. COMMIT-ON-EDGE: if the winning driver changed, and the PREVIOUS driver
 *      has `commitsOnEdge: true`, fold the last produced pose into `base`
 *      exactly once. Drivers that declare this flag (tween, autoRotate, clip)
 *      must bake their saturated pose into base on deactivation. `orbitDrag`
 *      and `resting` are excluded (orbitDrag commits via `onGestureEnd`;
 *      resting's pose IS `base`).
 *   3b. PIVOT-PIN: while a scene body is focused, overwrite the winning driver's
 *      target with the live body position (for drivers that declare
 *      `pivotsOnFocusedBody`). The body owns the pivot; the driver owns the orbit
 *      terms — so a drag / auto-rotate orbits AROUND the moving body.
 *   4. UPDATE Resources: `prevActiveId.current = activeId`,
 *      `lastPose.current = pose`.
 *
 * Then `deriveFrameContext` receives the already-produced `pose` and the live
 * `projection` Resource, assembles a full `OrbitCamera`, and computes vp etc.
 * The clock is advanced exactly once per frame by step 1's `runCameraDrivers`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { Mat3 } from '../../../@types/math/Mat3';

import { runCameraDrivers } from '../camera/cameraDrivers';
import { activeDriverId } from '../camera/activeDriverId';
import { applyFocusedBodyPivot } from '../camera/applyFocusedBodyPivot';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { poseEyePositionMpc } from '../../../utils/camera/poseEyePositionMpc';
import { eyeAltitudeMpc } from '../../../utils/camera/eyeAltitudeMpc';
import { pivotCenterMpc } from '../camera/pivotCenterMpc';
import {
  tweenElapsed,
  accumulateFollowPan,
  frameTweenElapsed,
  followPanWorld,
} from '../camera/cameraClock';
import { resolveFrameBasis } from '../camera/resolveFrameBasis';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { DEFAULT_FOV_DEG } from '../../../data/defaults';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { surfaceFollowEngaged } from '../../../utils/camera/surfaceFollowEngaged';
import { surfaceFollowCorotation } from '../camera/surfaceFollowCorotation';
import { reencodePose } from '../../../utils/camera/reencodePose';
import { updatePosition } from '../../../utils/camera/updatePosition';
import { matrixToQuaternion } from '../../../utils/math/matrixToQuaternion';
import { multiply3x3 } from '../../../utils/math/multiply3x3';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { produceStructureMarkers } from '../presentation/produceStructureMarkers';
import { deriveFrameContext } from './frameContext';
import { deriveBodyStates } from './deriveBodyStates';
import { sceneBodyStates } from './sceneBodyStates';
import { earthSurfaceTier } from './earthSurfaceTier';
import { prepareStarCut } from './passes/starCatalogLayer';
import { prepareEarthFrame, earthLayer } from './passes/earthLayer';
import { NEAR0, slabViewOf } from './slabs';
import { cutSurfaceTiles } from '../../../utils/scene/cutSurfaceTiles';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { drawPickDebugOverlay } from './drawPickDebugOverlay';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import {
  commitCameraPose,
  cancelCameraTween,
  clearFrameTween,
  startFrameTween,
} from '../../../state/camera/cameraSlice';
import { FRAME_TWEEN_MS } from '../../../state/camera/watchOrientationChangeSaga';
import { computeScaleInfo } from '../helpers/scaleBar';
import { engineScaleChanged, engineBodyDistanceReported } from '../../../state/engine/engineSlice';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { selectTimeState, selectIsLiveTicking } from '../../../state/time/selectors';
import { throttleByTime } from '../../../utils/throttle/throttleByTime';
import { distanceMpc } from '../../../utils/math/distanceMpc';

/**
 * Desired scale-bar width in CSS pixels. The engine computes this per-frame
 * and dispatches the result to the store, so every consumer (ScaleBar, tour
 * sagas) reads a consistent value without a React-side computation callback.
 * Capped by the ScaleBar panel's content box: that panel now hugs the TimeBar
 * pill's mono readout (~145 px content width; see ScaleBar.module.css), so the
 * legend must stay comfortably under it to avoid clamping. 120 px reads clearly
 * and leaves margin against the ~145 px box; if that panel width changes, this
 * ceiling follows.
 */
const SCALE_TARGET_PX = 120;

/**
 * Rate-limit the `engineBodyDistanceReported` publication to ~4 Hz. The store
 * field it writes feeds the InfoCard's live distance row, which does not need
 * a 60 Hz firehose — a per-frame dispatch would churn React for a value humans
 * read at reading speed. The gate is created ONCE at module scope (not per
 * frame): a fresh `throttleByTime(250)` every call would reset its closure
 * state and defeat the throttle. It pairs with the reducer's dedup-on-write,
 * so an unchanged report inside an open window still costs nothing downstream.
 */
const publishBodyDistanceGate = throttleByTime(250);

/**
 * Idle-tick cadence for a LIVE sim clock: how long the render loop may sleep
 * between heartbeat frames (the scheduling site below) before Earth's
 * terminator drift becomes visible. A FUNCTION of the focused pivot's
 * altitude, not a fixed value — a single constant can't serve both ends of
 * the reachable range: honest at the ~61 m altitude just above the surface
 * standoff floor demands near-every-frame ticking, while that cadence is
 * needless GPU burn once the camera is far from any surface.
 *
 * Derivation, same formula throughout: live time advances one sim day per
 * real day, so Earth's terminator sweeps `(360° / 86400 s) * T` of ground per
 * tick of length T (seconds); on screen that maps to pixels via
 * `2 * h * tan(fovY / 2)` (h = altitude) over the canvas's pixel height.
 * Solving `drift_px = budget_px` for T gives a cadence LINEAR in h:
 *
 *   T(h) = (budget_px / canvas_px) * 2 * tan(fovY / 2) / groundSpeed * h
 *
 * `IDLE_TICK_MS_PER_KM` below is exactly that slope, computed once from the
 * named constants that follow (60° FOV, Earth's radius and rotation rate)
 * instead of inlined as a magic float, so it stays checkable against this
 * comment. Two reference points: at h ≈ 61.2 m — four times Earth's ~15.3 m
 * surface-standoff floor — T ≈ 0.25 ms, clamped up to the 16 ms floor (no
 * discrete cadence holds 1.5 px this close to the surface, so "idle tick" and
 * "render every frame" become the same request); at h ≈ 127 km, T ≈ 528 ms,
 * clamped down to the 500 ms ceiling (the historical idle heartbeat, honest
 * again above ~120 km).
 *
 * Calibrated to Earth's own rotation rate — the only body this feature
 * streams near-surface tiles for — and reused verbatim for whatever body or
 * survey star is the live focused pivot, via the same per-body/star altitude
 * Task 5's `pivotRadiusMpc` already resolves (`focusedPivotAltitudeMpc`
 * below). A slower-rotating focused body would tolerate a longer T than this
 * formula grants it, so the result is a safe upper bound on tick frequency
 * everywhere, not a per-body rotation model — generalizing the slope itself
 * per body is out of scope here. No focused body/star pivot (or a volume
 * target with no surface) → `focusedPivotAltitudeMpc` is `null` → MAX, the
 * pre-adaptive far-camera behavior.
 *
 * Kept OUT of `shouldKeepTicking` regardless: pinning the loop at 60 fps for a
 * rotation this slow would burn the GPU for no visible gain outside the
 * near-surface band above, so instead we ask the scheduler for ONE frame per
 * tick — a heartbeat that keeps the terminator honest while the loop sleeps
 * in between. The React TimeBar readout runs its own timer, so this
 * heartbeat serves only the 3D scene.
 *
 * A `setInterval` would be the wrong tool: it fires unconditionally, fighting
 * render-on-demand and double-scheduling whenever a real wake (drag, fade) is
 * already driving the loop. The scheduler's `requestIdleFrame` instead arms a
 * single one-shot that self-cancels once fired and is ignored while a rAF frame
 * is already queued — so it only ever supplies the frames the busy loop didn't.
 */
const LIVE_IDLE_TICK_MIN_MS = 16; // one frame at 60 Hz — no finer cadence is meaningful
const LIVE_IDLE_TICK_MAX_MS = 500; // historical idle heartbeat; honest above ~120 km (see above)

const IDLE_TICK_DRIFT_BUDGET_PX = 1.5;
const IDLE_TICK_CANVAS_HEIGHT_PX = 900;
const IDLE_TICK_GROUND_SPEED_KM_PER_S =
  (360 / 86_400) * ((2 * Math.PI * SCENE_EARTH.radiusKm) / 360); // ≈ 0.463 km/s
const IDLE_TICK_MS_PER_KM =
  (((IDLE_TICK_DRIFT_BUDGET_PX / IDLE_TICK_CANVAS_HEIGHT_PX) *
    (2 * Math.tan((DEFAULT_FOV_DEG / 2) * (Math.PI / 180)))) /
    IDLE_TICK_GROUND_SPEED_KM_PER_S) *
  1000; // ≈ 4.15 ms per km of altitude

function liveIdleTickMs(focusedPivotAltitudeMpc: number | null): number {
  if (focusedPivotAltitudeMpc === null) return LIVE_IDLE_TICK_MAX_MS;
  const altitudeKm = focusedPivotAltitudeMpc / SCALE_UNITS.KM_TO_MPC;
  const budgetMs = IDLE_TICK_MS_PER_KM * altitudeKm;
  return Math.min(LIVE_IDLE_TICK_MAX_MS, Math.max(LIVE_IDLE_TICK_MIN_MS, budgetMs));
}

/**
 * Surface-fixed follow's hysteresis band (spec §4.6): engage/disengage
 * altitudes derived from projected on-screen ground-drift rate, using the
 * SAME drift model the idle-tick derivation above owns —
 *
 *   drift_px_per_s(h) = IDLE_TICK_CANVAS_HEIGHT_PX * IDLE_TICK_GROUND_SPEED_KM_PER_S
 *                       / (2 * h_km * tan(DEFAULT_FOV_DEG / 2))
 *
 * — inverted for h. Engage at 3 px/s (~120 km), disengage at 1.5 px/s
 * (~241 km); same 2x ratio the old standoff-multiple band used, still
 * absorbing switch-point jitter (scroll noise, hand jitter) with a single
 * threshold. Fixed absolute altitudes, NOT multiples of the per-body
 * standoff floor as before: rotation's visibility is set by drift on screen,
 * not by body radius (user ruling 2026-08-22 — the old ~31/61 m band left
 * follow disengaged at ~7.5 km over Earth, where the ground plainly slides).
 * Earth-calibrated ground speed, reused for every body, same posture as the
 * idle-tick derivation: a slow rotator just engages "early," locking a
 * near-static ground — benign, not a per-body rotation model.
 */
export const SURFACE_FOLLOW_ENGAGE_DRIFT_PX_PER_S = 3;
export const SURFACE_FOLLOW_DISENGAGE_DRIFT_PX_PER_S = 1.5;

function surfaceFollowAltitudeMpc(driftPxPerS: number): number {
  const altitudeKm =
    (IDLE_TICK_CANVAS_HEIGHT_PX * IDLE_TICK_GROUND_SPEED_KM_PER_S) /
    (2 * driftPxPerS * Math.tan((DEFAULT_FOV_DEG / 2) * (Math.PI / 180)));
  return altitudeKm * SCALE_UNITS.KM_TO_MPC;
}

/**
 * Residual-roll floor for the disengage ease: below ~0.06° of accumulated R̃
 * skip the roll rather than hold the loop awake for FRAME_TWEEN_MS slerping
 * between two equal bases. Compared against R̃'s TRACE (`1 + 2·cos θ`).
 */
const ROLL_WORTH_EASING = 1 + 2 * Math.cos(1e-3);

export const SURFACE_FOLLOW_ENGAGE_ALTITUDE_MPC = surfaceFollowAltitudeMpc(
  SURFACE_FOLLOW_ENGAGE_DRIFT_PX_PER_S,
);
export const SURFACE_FOLLOW_DISENGAGE_ALTITUDE_MPC = surfaceFollowAltitudeMpc(
  SURFACE_FOLLOW_DISENGAGE_DRIFT_PX_PER_S,
);

/**
 * Run one frame of the render loop. Called every rAF tick by the scheduler in
 * `state.subsystems.scheduler` (see engine.ts's forward-declared `frame`
 * binding for the wiring).
 *
 * `nowMs` is `performance.now()`-shaped; engine.ts passes that exact value at
 * the call site. We accept it as a parameter rather than reading the global so
 * tests can drive deterministic timing.
 */
export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  // ── Clip-player tick (MUST run first) ─────────────────────────────────────
  //
  // Task 12 contract: `clipPlayer.tick(nowMs)` is the first statement of
  // `runFrame` — before `deriveSourceMasks` / `reevaluateDemand` and before
  // the camera produce step. Scene cues (fade / show / hide / focus) fired
  // here are therefore committed before this frame derives masks, demand, or
  // the camera pose from store state. A cue that dispatches a store action
  // (e.g. `settings.milkyWay.enabled → false`) is seen by every downstream
  // reader in the same frame, rather than lagging one frame behind.
  //
  // `clipPlayer` is non-null from t=0 (no GPU dep), so no null-check needed.
  state.subsystems.clipPlayer.tick(nowMs);

  // ── Demand re-evaluation ──────────────────────────────────────────────────
  //
  // Re-derive what should be loading from current state, every frame. The
  // single seam that turns any state change into the right loads: a handle
  // setter flips its demand-gating state and calls requestRender, which wakes
  // the loop, which runs this. No setter has to remember to trigger loading —
  // requestRender is the universal 'something changed' signal it already must
  // send. Idle-guarded, so an already loading/ready/error asset is a cheap
  // no-op on steady-state frames.
  //
  // Derive the galaxy catalog draw/pick masks from settings + live fade opacity
  // at the top of every frame, before any reader (render or pick pass) touches
  // them — so the masks are always a fresh projection of the single source of
  // truth, never a hand-maintained mirror. `deriveSourceMasks` is pure: it
  // returns the masks, which live as a per-frame-derived local here (no longer
  // written into state) and are threaded into the render + pick passes below.
  // Demand itself reads settings directly, not the masks.
  const masks = deriveSourceMasks(state);
  reevaluateDemand(state);

  // ── Resize → projection Resource, then reconcile the offscreen table ─────
  //
  // `resizeCanvasToDisplay` returns `true` only when dimensions changed, so
  // `cameraRuntime.projection.aspect` is patched only in that branch. Aspect
  // lives on `projection` (the engine Resource), NOT on `state.cam`:
  // `state.cam` is the drag register, and `assembleOrbitCamera` merges the
  // projection Resource's aspect onto every produced pose instead.
  //
  // `reconcile` runs UNCONDITIONALLY — one seam answering two inputs, the
  // canvas size and every state-driven `scale` (the `mw-aggregate` divisor is
  // a live slider). It reallocates only the rows whose pixel size actually
  // moved, so a steady-state frame allocates nothing. Both can run
  // pre-bootstrap; `renderTargets` is null until initGpu, hence the `?.`.
  if (resizeCanvasToDisplay(deps.canvas)) {
    state.cameraRuntime.projection.aspect = deps.canvas.width / deps.canvas.height;
  }
  // Unlike aspect (canvas-resize-gated), the FOV slider can change on ANY frame
  // with no resize event, so this write runs unconditionally — a settings-slider
  // twin of the aspect assignment above, both landing on the same projection
  // Resource `assembleOrbitCamera` merges into the live camera every frame.
  state.cameraRuntime.projection.fovYRad = state.settings.camera.fovDeg * (Math.PI / 180);
  state.gpu.renderTargets?.reconcile(state, {
    width: deps.canvas.width,
    height: deps.canvas.height,
  });

  // ── Milky-Way star count → cloud regeneration ───────────────────────────
  //
  // Unconditional like `renderTargets.reconcile` above; the mismatch check
  // and regeneration rationale live on `MilkyWayCloud.reconcile` itself.
  state.gpu.milkyWayCloud?.reconcile(state.settings.milkyWay.starCount);

  // ── Camera produce → commit-on-edge ──────────────────────────────────────
  //
  // Single camera-write site per frame. The produce step calls `runCameraDrivers`
  // (which calls `pickWinner` and the winner's `pose`), then the tween-completion
  // and commit-on-edge steps gate on the active driver identity. The four steps
  // run before `deriveFrameContext` so a camera-only-ready frame still makes
  // motion progress before we early-return for missing GPU handles.
  const rootState = deps.cb.store.getState();

  // ── Sim-clock instant for this frame (derived ONCE, before produce) ───────
  //
  // `deriveSimDays` resolves the sim clock from the time-intent slice plus this
  // frame's wall-clock sample — pure, no accumulator. We compute it here, above
  // the camera produce step, for two reasons:
  //   1. A body-following camera driver (a later feature) runs INSIDE the
  //      produce step and must aim at where the body is THIS frame, so the body
  //      snapshot has to exist before `runCameraDrivers` is called.
  //   2. `deriveFrameContext` stamps `simDays` onto `ctx` (below) so every
  //      per-frame body reader shares one epoch via `sceneBodyStates(state, ctx)`.
  //
  // `deriveBodyStates(simDays)` primes the one-deep memo at this instant so the
  // pre-produce driver and every post-ready pass reader hit the SAME cached map
  // by reference — one Kepler solve per frame, not one per reader. The result is
  // intentionally discarded here; the memo IS the shared snapshot.
  const simDays = deriveSimDays(selectTimeState(rootState), nowMs);
  deriveBodyStates(simDays);

  // Record the frame's instant as single-writer state, the exact analogue of
  // `lastPose.current` for the pose (updated in step 4 below). The pick path
  // reads THIS — not the derive memo's cached key — so a between-frames
  // `deriveBodyStates(CONST_J2000)` (extractSelectionRow, construction-time
  // consts) cannot repoint the epoch the pick sees. runFrame is the only writer.
  state.cameraRuntime.lastRenderedSimDays.current = simDays;

  // ── (1) PRODUCE the pose from the driver table ────────────────────────────
  //
  // One call to `runCameraDrivers` per frame. `pickWinner` is called inside
  // `runCameraDrivers` and the clock is advanced once here — `deriveFrameContext`
  // receives the already-produced pose so it does NOT re-call the drivers or
  // advance the clock again.
  //
  // This runs even if `state.cam` is null (pre-bootstrap): in that case
  // `orbitDrag` calls `poseOf(null)` which would crash — but `orbitDrag` is
  // only active when `s.camera.dragging` is true, and dragging cannot be true
  // before the controls are attached (which happens in wireInput, after cam is
  // non-null). So the resting or tween/autoRotate drivers win pre-bootstrap,
  // both of which ignore `cam`. The guard below for the scale-bar snapshot
  // still keeps the post-cam path distinct.
  const pose = runCameraDrivers(
    deps.drivers,
    rootState,
    state.cam!,
    state.cameraRuntime.clock,
    nowMs,
  );
  const activeId = activeDriverId(deps.drivers, rootState);

  // ── Orientation basis: two readers, two different values ─────────────────
  //
  // `poseBasis` is the COMMITTED frame (`ORIENTATION_FRAMES[orientation]`).
  // `watchOrientationChangeSaga` writes the DESTINATION into `settings.orientation`
  // the instant a switch starts, so this never moves during a roll — the eye,
  // decoded through it via `updatePosition`, holds still; only up rotates.
  //
  // `upBasis` is `resolveFrameBasis`'s live B(t), resolved exactly once here.
  //
  // `state.cameraRuntime.upBasis.current` gets `upBasis`, NOT `poseBasis`: it
  // seeds the NEXT switch's `fromQuat` (`watchOrientationChangeSaga`), and a
  // re-switch mid-roll must compose from the live pole, not the committed one.
  //
  // `state.cam` and `deriveFrameContext` below both take the same split —
  // committed basis for position decode, live basis for up — see
  // `OrbitCameraInit.d.ts` for why the two camera fields exist.
  const poseBasis = ORIENTATION_FRAMES[rootState.settings.orientation];
  const upBasis = resolveFrameBasis(
    rootState.settings.orientation,
    rootState.camera.frameTween,
    state.cameraRuntime.clock,
    nowMs,
  );
  state.cameraRuntime.upBasis.current = upBasis;

  // ── Surface-fixed follow: the co-rotating frame (spec §4.6) ──────────────
  //
  // While engaged, everything the user authored (yaw/pitch decode basis,
  // `clock.followPanStored`) lives in the focused body's frame AS IT STOOD AT
  // ENGAGE; `surfaceFollowCorotation`'s R̃ maps it to now. SINGLE resolution
  // point: consumers below take an `effective*` value, never the raw one. NOT
  // `cameraRuntime.upBasis.current` above — that box seeds the next
  // orientation-FRAME switch's `fromQuat`, a different concept.
  //
  // This block and the fold below are hand-transcribed by
  // `tests/services/engine/camera/zoomOutPivotDrift.test.ts`; edits here that
  // change the resolution order leave that guard green against a fossil.
  const surfaceFollow = state.cameraRuntime.surfaceFollow;
  const surfaceFollowFocus = state.selectionRows.focus;
  const clock = state.cameraRuntime.clock;
  // Pose-derived eye: `ctx.cam.position` doesn't exist yet and `pose.target` is
  // stale for a MOVING focus until step 3b's PIVOT-PIN, which is pure — so
  // previewing it here is redundant arithmetic, not a hazard.
  const pivotEyePose = applyFocusedBodyPivot(
    pose,
    deps.drivers.find((d) => d.id === activeId)?.pivotsOnFocusedBody ?? false,
    surfaceFollowFocus,
    simDays,
    clock.followPanStored,
  );
  // RAW basis against the STORED (un-mapped) pan, deliberately: R̃ maps BOTH
  // terms of `eye − centre`, so this altitude is invariant under it — and the
  // un-mapped pair is the arm with no circular dependency on the engagement
  // decision it feeds. Mapping one term alone would NOT be invariant.
  const poseEyeMpc = poseEyePositionMpc(pivotEyePose, poseBasis);
  // Altitude for `liveIdleTickMs` (further down), for a star or a body alike.
  // EYE-based, not `distance − radius` — a pan strafes `target` off the pivot's
  // centre regardless of PIVOT-PIN; see `eyeAltitudeMpc`'s header. The body arm
  // below fills this in from the same call the follow hysteresis needs.
  let focusedPivotAltitudeMpc: number | null =
    surfaceFollowFocus?.type === 'star'
      ? eyeAltitudeMpc(
          poseEyeMpc,
          surfaceFollowFocus.positionMpc,
          surfaceFollowFocus.radiusKm * SCALE_UNITS.KM_TO_MPC,
        )
      : null;
  const surfaceFollowBodyId = surfaceFollowFocus?.type === 'body' ? surfaceFollowFocus.id : null;
  const surfaceFollowBodyChanged = surfaceFollowBodyId !== surfaceFollow.bodyId;
  // A focus switch re-decides from scratch: carrying `engaged` over would
  // compose a cross-body correction, and could wedge disengage.
  const engagedSeed = surfaceFollowBodyChanged ? false : surfaceFollow.engaged;
  let surfaceFollowEngagedNow = false;
  let liveBodyOrientation: Mat3 | null = null;
  if (surfaceFollowFocus?.type === 'body') {
    const bodyState = deriveBodyStates(simDays).get(surfaceFollowFocus.id);
    if (bodyState) {
      const radiusMpc = surfaceFollowFocus.radiusKm * SCALE_UNITS.KM_TO_MPC;
      const altitudeMpc = eyeAltitudeMpc(poseEyeMpc, bodyState.positionMpc, radiusMpc);
      focusedPivotAltitudeMpc = altitudeMpc;
      surfaceFollowEngagedNow = surfaceFollowEngaged(
        engagedSeed,
        altitudeMpc,
        SURFACE_FOLLOW_ENGAGE_ALTITUDE_MPC,
        SURFACE_FOLLOW_DISENGAGE_ALTITUDE_MPC,
      );
      liveBodyOrientation = bodyState.orientation;
    }
  }
  // R̃ for the engagement being LEFT, resolved BEFORE the snapshot below moves:
  // on a focus switch it belongs to the body `surfaceFollow.bodyId` still names.
  const leavingCorotation =
    surfaceFollow.engaged && (surfaceFollowBodyChanged || !surfaceFollowEngagedNow)
      ? surfaceFollowCorotation(surfaceFollow, simDays)
      : null;

  surfaceFollow.engaged = surfaceFollowEngagedNow;
  surfaceFollow.bodyId = surfaceFollowBodyId;
  if (!surfaceFollowEngagedNow) {
    surfaceFollow.orientationAtEngage = null;
  } else if (!engagedSeed && liveBodyOrientation !== null) {
    // Copy, not alias — the body's orientation changes every frame.
    surfaceFollow.orientationAtEngage = [...liveBodyOrientation] as Mat3;
  }
  // Left-multiply: the bases decode LOCAL angles into WORLD directions
  // (`assembleOrbitCamera`: `dir_world = poseBasis · dir_local`).
  const corotation = surfaceFollowCorotation(surfaceFollow, simDays);
  const effectivePoseBasis = corotation === null ? poseBasis : multiply3x3(corotation, poseBasis);
  // UP keeps the OUTGOING correction on the frame engagement is left: the roll
  // tween the fold starts is stored too late to steer this frame's own basis,
  // so dropping to raw here would snap, then the tween would jump back and
  // re-roll it.
  const upCorotation = leavingCorotation ?? corotation;
  const effectiveUpBasis = upCorotation === null ? upBasis : multiply3x3(upCorotation, upBasis);

  if (state.cam) {
    // Pre-bootstrap `cam` is null; a grab is impossible until wireInput attaches
    // controls, so there is no decode to keep in sync until then.
    state.cam.poseBasis = effectivePoseBasis;
    state.cam.upBasis = effectiveUpBasis;
  }

  // Clear a finished frame roll exactly once, mirroring the camera-tween
  // completion block below: when the roll's elapsed saturates its duration, the
  // slerp has landed on the destination basis, so drop the descriptor and let the
  // steady branch take over next frame. Re-calling `frameTweenElapsed` is safe —
  // the descriptor reference is unchanged, so the clock-reset branch does not fire
  // and no double-tick occurs. `EASE` clamps the slerp parameter, so THIS frame's
  // already-resolved basis is the destination exactly; clearing only affects the
  // next frame's getState.
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

  // ── (2) TWEEN COMPLETION: cancel a finished tween exactly once ────────────
  //
  // Must run AFTER the pose is produced (so `pose` already == to via saturation
  // at elapsed >= durationMs) and BEFORE commit-on-edge sees the
  // deactivation. The cancel sets tween=null in the store; on the NEXT frame the
  // tween driver is inactive → winner changes away from 'tween' → commit fires.
  // Exactly one commit per tween: the commit-on-edge prev!==activeId guard is
  // false while the tween is still the winner, so no per-frame commit fires.
  //
  // Re-calling `tweenElapsed` here is safe (idempotent same-frame): the
  // descriptor reference is unchanged, so the clock-reset branch in
  // `tweenElapsed` does not fire, and the returned elapsed is the same value
  // `runCameraDrivers` used — no double-tick of the clock.
  if (activeId === 'tween' && rootState.camera.tween !== null) {
    const elapsed = tweenElapsed(state.cameraRuntime.clock, rootState.camera.tween, nowMs);
    if (elapsed >= rootState.camera.tween.durationMs) {
      deps.cb.store.dispatch(cancelCameraTween());
      // The tween driver deactivates on the NEXT frame; the commit fires then
      // (via the prevActiveId edge), baking `lastPose` (== to, saturated)
      // into base. We do NOT change `activeId` here.
    }
  }

  // ── (3) COMMIT-ON-EDGE: fold the last produced pose into base, once ───────
  //
  // Fires when the active driver changed AND the departing driver declared
  // `commitsOnEdge: true`. Drivers that declare this (tween, autoRotate, clip)
  // must bake their final pose into `base` on deactivation so the camera holds
  // the saturated pose rather than snapping back to the pre-animation base.
  // `orbitDrag` and `resting` do NOT declare it:
  //   - orbitDrag commits via `onGestureEnd` (the synchronous DOM handler),
  //     which bakes the final cam pose before the next frame sees dragging=false.
  //   - resting's pose IS base; committing it is a noise-write.
  //
  // Reading the flag off the driver row (rather than a hardcoded id set) means
  // adding a new committing driver is a one-line declaration in buildCameraDrivers,
  // with no surgery here. The clip driver is among them: its deactivation edge
  // bakes the final composed pose into base for free.
  //
  // `lastPose.current` at this point holds the PREVIOUS frame's pose (it has
  // not been updated for this frame yet — that happens in step 4). So when the
  // tween deactivates on frame N, `lastPose` holds frame N-1's saturated pose
  // (== desc.to exactly), and that is what lands in `base`. Exactly one commit,
  // exactly at the `desc.to` value.
  const { lastPose, prevActiveId } = state.cameraRuntime;
  const prev = prevActiveId.current;
  // The pose this frame renders, plus the driver whose angles it carries (the
  // surface-follow fold below needs to know); a deactivation edge overrides
  // both to the departing driver's.
  let renderPose = pose;
  let renderPoseAuthorId = activeId;
  if (prev !== activeId && deps.drivers.find((d) => d.id === prev)?.commitsOnEdge) {
    deps.cb.store.dispatch(commitCameraPose(lastPose.current));
    // Commit-on-edge fires AFTER produce, so the produce step above ran the
    // INCOMING driver against the PRE-commit `base`. For a driver that reads
    // `base` (resting / autoRotate) that pose is the stale pre-edge value —
    // rendering it flashes the camera back to where the tween, spin, or clip
    // started for one frame. `lastPose.current` is the animation's final pose
    // and the value we just baked into `base`, so render THAT this frame instead.
    renderPose = lastPose.current;
    renderPoseAuthorId = prev;
  }

  // ── Surface-follow fold: leave the engage frame exactly once ──────────────
  //
  // Sited AFTER the arbitration above, and that ORDERING IS THE CONTRACT: the
  // fold is the last word on this frame's pose, so whatever the edge path just
  // baked is superseded by the same pose in the raw frame (placed above it, the
  // edge re-commit silently discards the fold). Sitting below the frame-roll
  // clear likewise keeps that guard's frame-start snapshot from wiping the roll
  // started here. Transcribed by `zoomOutPivotDrift.test.ts` — see the
  // surface-follow block's header.
  if (leavingCorotation !== null) {
    // The pan is the clock's, not a driver's, so it folds whoever won.
    clock.followPanStored = followPanWorld(clock, leavingCorotation);
    // Angles fold only if their author expressed them in the engage frame, and
    // `pivotsOnFocusedBody` IS that set (orbit drivers read yaw/pitch off `base`
    // / the drag register). A keyframing driver authors world-frame angles
    // through its own pinned basis; rotating those by R̃ would mis-aim it.
    if (deps.drivers.find((d) => d.id === renderPoseAuthorId)?.pivotsOnFocusedBody) {
      renderPose = reencodePose(renderPose, multiply3x3(leavingCorotation, poseBasis), poseBasis);
      deps.cb.store.dispatch(commitCameraPose(renderPose));
      if (activeId === 'orbitDrag' && state.cam) {
        // The drag register carries the same frame tag as `base` and folds with
        // it — a pinch-zoom out through the band disengages mid-gesture.
        state.cam.yaw = renderPose.yaw;
        state.cam.pitch = renderPose.pitch;
        updatePosition(state.cam);
      }
    }
    // Re-encoding carries only the eye DIRECTION; the residual up-roll rides the
    // orientation-frame roll, starting from where up is held this frame.
    if (leavingCorotation[0] + leavingCorotation[4] + leavingCorotation[8] < ROLL_WORTH_EASING) {
      deps.cb.store.dispatch(
        startFrameTween({
          fromQuat: matrixToQuaternion(effectiveUpBasis),
          to: rootState.settings.orientation,
          durationMs: FRAME_TWEEN_MS,
          easing: 'easeInOutCubic',
        }),
      );
    }
  }

  // ── (3b) PIVOT-PIN: re-centre the pose on a focused body ──────────────────
  //
  // Body focus is un-braided into two concerns: the focused body owns the PIVOT
  // (target), whichever driver won owns the ORBIT terms (yaw/pitch/distance).
  // Here we apply the body pivot to the winning driver's pose in ONE place, so a
  // drag orbits around the moving body (no drift), the autoRotate button spins
  // around it, and the idle follow holds it — without followBody having to win
  // the whole pose. Only drivers that declare `pivotsOnFocusedBody` are pinned
  // (clip / tween keyframe a full path including target and opt out). The pin is
  // absolute (SETS the target), so baking `renderPose` into `base` on the next
  // commit-on-edge can never double-apply the body translation.
  //
  // A right-drag STRAFE while following folds into `clock.followPanStored` FIRST,
  // then the pin resolves the pivot to `bodyPosition + panWorld`. The offset —
  // not `cam.target`, which the pin overwrites — is the strafe's home, so the
  // shifted pivot still translate-follows the body.
  // Read the pivot focus off `rootState` (the SAME store snapshot the drivers
  // resolved against this frame), so the pin and the winner never disagree on
  // what is focused. A separate `focusRow` local below reads the EngineState
  // mirror for the structure-focus / time-report sections.
  const pivotFocus = rootState.selectionRows.focus;
  const followingBody = bodyMovesThisFrame(pivotFocus);
  if (state.cam) {
    accumulateFollowPan(
      clock,
      activeId === 'orbitDrag' && followingBody,
      state.cam.target,
      corotation,
    );
  } else {
    // Pre-bootstrap: no cam, no drag possible — keep the delta chain reset.
    clock.lastPanTarget = null;
  }
  renderPose = applyFocusedBodyPivot(
    renderPose,
    deps.drivers.find((d) => d.id === activeId)?.pivotsOnFocusedBody ?? false,
    pivotFocus,
    simDays,
    // Resolved after the accumulation above, so this frame's drag delta is in.
    followPanWorld(clock, corotation),
  );

  // ── (4) UPDATE Resources for next frame ───────────────────────────────────
  //
  // `prevActiveId` and `lastPose` are updated AFTER the commit-on-edge so the
  // commit correctly reads the PREVIOUS frame's values.
  prevActiveId.current = activeId;
  lastPose.current = renderPose;

  // Compute the scale-bar legend engine-side so the store's `engine.scale`
  // slice stays authoritative for every consumer (ScaleBar, tour sagas).
  // `clientWidth`/`clientHeight` are CSS pixels — required by computeScaleInfo;
  // using `width`/`height` (backing-store px) silently breaks the bar on retina.
  // state.cam non-null is the bootstrap-ready proxy — snap values come from
  // lastPose + projection, not from state.cam.
  if (state.cam) {
    const snap = {
      distance: lastPose.current.distance,
      fovYRad: state.cameraRuntime.projection.fovYRad,
    };
    // EYE-based altitude (`eyeAltitudeMpc`), not `distance − radius`: at this
    // point `lastPose.current` already reflects PIVOT-PIN (step 3b, above),
    // but a pan can still have strafed the target off the pivot's centre —
    // see that util's header. `ctx.cam.position` doesn't exist yet
    // (`deriveFrameContext` hasn't run), so the eye is pose-derived here too.
    const scalePivotRadiusMpc = pivotRadiusMpc(pivotFocus);
    const scalePivotCenterMpc =
      scalePivotRadiusMpc !== null ? pivotCenterMpc(pivotFocus, simDays) : null;
    const scalePivotAltitudeMpc =
      scalePivotRadiusMpc !== null && scalePivotCenterMpc !== null
        ? eyeAltitudeMpc(
            poseEyePositionMpc(lastPose.current, effectivePoseBasis),
            scalePivotCenterMpc,
            scalePivotRadiusMpc,
          )
        : null;
    const scaleInfo = computeScaleInfo({
      cam: snap,
      canvasSize: { width: deps.canvas.clientWidth, height: deps.canvas.clientHeight },
      targetPx: SCALE_TARGET_PX,
      pivotAltitudeMpc: scalePivotAltitudeMpc,
    });
    if (scaleInfo !== null) {
      deps.cb.store.dispatch(engineScaleChanged(scaleInfo));
    }
  }

  // ── Per-frame derived snapshot ────────────────────────────────────────────
  //
  // `deriveFrameContext` receives the already-produced `pose` and the live
  // `projection` Resource, assembles the full OrbitCamera, and pre-computes the
  // view-projection matrix, camera-position tuple, and pixel-per-radian scalar
  // for downstream `renderFrame()`. The 'not ready' branch is the brief window
  // before the first cloud lands; once cam + GPU handles populate together,
  // it's never taken again.
  const ctx = deriveFrameContext(
    state,
    deps.canvas,
    renderPose,
    state.cameraRuntime.projection,
    effectivePoseBasis,
    effectiveUpBasis,
    masks.draw,
    nowMs,
    simDays,
  );
  if (!ctx.isReady) {
    // Essential wake: bootstrap populates cam/GPU handles without waking any
    // channel — keep re-polling until the gate opens.
    state.subsystems.scheduler.requestRender();
    return;
  }

  // ── Structure-focus recession (computed ONCE, EARLY) ─────────────────────
  //
  // Focus mode fades non-member galaxies away when a cluster / supercluster /
  // void / group structure is focused. Resolve the focused structure (a bare
  // single-click select does not count; galaxy / nothing both → null) and let
  // the subsystem diff it against its focused id to drive the 400 ms
  // member-isolation fade.
  //
  // `produceFocusUniforms(nowMs)` TICKS the focus fade controller, so it
  // must run EXACTLY ONCE per frame — a second call would double-advance
  // the ramp (a visible glitch).  We compute it here, before the label
  // director, marker upload, and render-settings sections, because all of
  // those (and later per-galaxy presentation producers) consume the blend
  // via `ctx.focusBlend`.  The single returned `FocusUniformsValue` is
  // captured in `focusUniforms`; `ctx.focusBlend` and the render
  // `settings.focus` both read THAT captured value — never a fresh
  // `produceFocusUniforms` call.
  const focusRow = state.selectionRows.focus;
  // The focus row is the saga-reconciled SelectionRow for the focus slot.
  // A structure row IS a StructureInfo, so passing it directly typechecks.
  // A galaxy / milkyWay / nothing resolves to null, collapsing the
  // member-isolation fade.
  const focusedStructure = focusRow !== null && focusRow.type === 'structure' ? focusRow : null;
  state.subsystems.structureFocus.update(focusedStructure, nowMs);
  const focusUniforms = state.subsystems.structureFocus.produceFocusUniforms(nowMs);
  ctx.focusBlend = focusUniforms.blend;
  ctx.focus = focusUniforms;

  // ── Focused-body distance publication (throttled) ─────────────────────────
  //
  // Publish the camera→focused-body distance to the store so the InfoCard
  // reads it off `state.engine.focusedBodyDistanceMpc` without ever touching
  // the engine snapshot (the store-boundary rule). The ~4 Hz gate keeps this
  // off the per-frame React path; the reducer dedups an unchanged report.
  // The distance is from the RENDERED camera position to the focused scene
  // body's position IN THIS FRAME'S SNAPSHOT — so it tracks the body as the
  // clock moves it — and is null unless an orbital body (present in the
  // snapshot) is the current focus. A star or structure focus, or no focus,
  // reports null.
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

  // ── Per-frame impostor planners ───────────────────────────────────────────
  //
  // CPU-side step that populates the LOD subsystems' `lastOutput` arrays, which
  // `proceduralDisksLayer` / `texturedDisksLayer` read at draw time. The
  // atlas subsystem is mutated transitively by the textured-disk run (slot
  // allocations + fetch enqueues).
  // hiResFamous must run BEFORE the shared disk walk: the textured-disk body
  // reads hiResFamous.lastOutput.byFamousIdx and folds layer indices + crossfade
  // alphas into the DiskInstance literals it emits. Running it after would lag
  // by a frame and produce a visible flicker on close approach to a famous galaxy.
  if (state.subsystems.hiResFamous !== null) {
    state.subsystems.hiResFamous.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
      famousGalaxiesMeta: state.famousGalaxiesMeta,
    });
  }
  // ONE shared catalog walk drives both disk-planner bodies. It computes each
  // surviving row's geometry once and hands the scalars to the procedural body
  // (LOD-1) then the textured body (LOD-2) at two fixed call sites; each
  // subsystem's `beginFrame` returns the per-frame visitor the walk drives, and
  // that visitor's `endFrame` stashes the sorted result on its `lastOutput`.
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

  // ── Earth surface virtual texture — the tile planner ──────────────────────
  // A CPU-side planner, sited with the disk planners above. The gate is
  // `earthLayer.enabled` itself, not a hand-copied predicate, so the tiles and
  // the layer they refine can never disagree about whether Earth is on screen.
  const earthTiles = state.subsystems.earthTiles;
  const earth = state.data.bodies.earth;
  if (earthTiles !== null && earth !== null && earthLayer.enabled(state, ctx)) {
    // `earthSurfaceTier` reads the tier off the committed texture slot, not the
    // app-wide request, so a tier swap in flight can't make the planner believe
    // in detail that isn't on the GPU yet. Null until the manifest lands.
    const params = earthTiles.plannerParams(earthSurfaceTier(state));
    // Empty by default: overwritten below only on the path that actually
    // resolves a fresh cut. `setLastCut` runs unconditionally at the bottom
    // of this block so a null-params/null-prepared frame (a tier swap in
    // flight) draws nothing stale rather than last frame's cut.
    let cut: readonly SurfaceCutTile[] = [];
    if (params !== null) {
      // Same slab resolution `earthLayer.draw` uses (the f64 seam — see its
      // module header), so the tiles the planner asks for never drift from the
      // pixels the fragment samples them into.
      const view = slabViewOf(ctx, NEAR0);
      // Skip when Earth's frame derivation is null — mirrors the `earth !==
      // null` guard above (prepareEarthFrame returns null on exactly that
      // condition); kept explicit so this block doesn't lean on the outer
      // guard's reasoning to satisfy the type checker.
      const prepared = prepareEarthFrame(state, ctx, view);
      if (prepared !== null) {
        // The single walk: `cut` is what earthLayer.draw draws this frame,
        // `requests` is what update()'s fetch loop drives — see
        // cutSurfaceTiles's header for why one walk produces both rather
        // than two independently re-deriving the same horizon/frustum logic.
        const result = cutSurfaceTiles({
          ...params,
          camPosLocal: prepared.camLocal,
          viewProjLocal: prepared.mvpLocal,
          viewportPx: view.viewportPx,
          residentSlot: earthTiles.residentSlot,
        });
        cut = result.cut;
        earthTiles.update({ plan: result.requests });
      }
    }
    earthTiles.setLastCut(cut);
  }

  // Read OUTSIDE the gate above: `isAnimating()` is true while the manifest is
  // in flight, a state entered BEFORE the subsystem can ever engage — voting
  // only on engaged frames would let a stopped camera sleep the loop mid-fetch.
  const earthTilesAnimating = earthTiles?.isAnimating() ?? false;

  // ── Label director per-frame update ──────────────────────────────────────
  //
  // Runs BEFORE the GPU dispatch so `labelRenderer.setLabels` /
  // `markerLineRenderer.setLines` are uploaded before `renderFrame` reads those
  // buffers. The director polls every registered `Label2DProducer` (milkyWayLabel,
  // structures, ...), merges, change-detects via signature hash, and flushes
  // once; it null-checks its renderers, so this is safe before the atlas load
  // completes. The return value is the label wake vote, folded into the
  // keep-ticking bag below rather than the director calling requestRender.
  const labelsAnimating = state.subsystems.labelDirector.runFrame(state, ctx);

  // ── Star-cut planner (primes the per-ctx memo, surfaces the wake vote) ────
  //
  // Run the survey-star octree walk + LOD-fade advance ONCE here, as a planner
  // peer of the disk/label planners above. Two reasons it lives at frame-body
  // level rather than only inside the star draw:
  //   1. The three star layers (leaf / aggregate / upsample) hit the per-ctx
  //      memo during the GPU dispatch, so this call primes it — the walk still
  //      runs exactly once for the frame.
  //   2. It surfaces `anyNodeFading` for the keep-ticking predicate below. The
  //      wake vote used to fire from inside the pass (a `requestRender` scattered
  //      away from the single authority); now the pass computes the vote and
  //      `shouldKeepTicking` decides.
  // `prepareStarCut` is a no-op returning null when the star pass isn't live
  // (renderer null / master off) — that maps to `starFadeAnimating: false` below.
  const starCut = prepareStarCut(state, ctx);

  // ── Per-frame marker upload ───────────────────────────────────────────────
  //
  // Like the label flush above: produceStructureMarkers walks the structure
  // store, applies fade math, and hands descriptors to the renderer. Must run
  // BEFORE the GPU dispatch so the instance buffer is uploaded before
  // `structureMarkersLayer` reads it. Null-checked for the pre-initGpu window.
  if (state.gpu.structureMarkerRenderer !== null) {
    const markers = produceStructureMarkers(state, ctx);
    state.gpu.structureMarkerRenderer.setMarkers(markers);
  }

  // ── GPU dispatch ──────────────────────────────────────────────────────────
  //
  // The whole encoder lifecycle (createCommandEncoder, the FRAME program's
  // render/composite steps, queue.submit) lives in `renderFrame.ts`; every
  // value it reads is forwarded as a field on `RenderFrameInput` so this
  // site stays free of GPU bookkeeping.
  renderFrame({
    ctx,
    state,
    device: deps.device,
    context: deps.context,
    timingService: deps.timingService,
  });

  // ── Pick-buffer debug overlay ─────────────────────────────────────────────
  //
  // Composite a colour-mapped pick-buffer overlay over the swap chain.
  // Runs AFTER renderFrame's submit — placed post-frame purely as a latency
  // choice (reflect the just-rendered pose with minimal lag), not because it
  // depends on the frame having drawn: `pickProgram.renderForDebug()` rebuilds
  // the pick-time camera as a value and re-draws the pickable layers itself.
  // The helper owns its own encoder/submit with `loadOp: 'load'` so the OVER
  // blend composites on top of the tone-mapped frame without re-rendering.
  //
  // Hover picking is now fully pointer-driven (hoverPickDriver, wired in
  // wireInput.ts) — there is no longer an in-frame pick block here.
  drawPickDebugOverlay(state, deps);

  // ── Render-on-demand: continue ticking ONLY if motion or async work is in
  // flight. Otherwise the loop sleeps until a channel mouth wakes it: input,
  // a fade or tween start, a slot reaching ready, a selection/focus change,
  // or a settings write. `shouldKeepTicking` owns the full predicate (camera
  // motion, in-flight thumbnails, fades, structure-focus, animated flow) and
  // is deliberately independent of what is pickable — see its module header.
  //
  // Tick the FadeRegistry BEFORE the predicate reads isAnyAnimating: tick is
  // the single resolution site for fadeTo promises, so without it the awaited
  // fade-out in galaxy-catalog visibility changes and tier-swap commits would
  // hang forever.
  state.subsystems.fades.tick(nowMs);
  const keepTicking = shouldKeepTicking(state, rootState, nowMs, {
    starFadeAnimating: starCut?.anyNodeFading ?? false,
    earthTilesAnimating,
    labelsAnimating,
  });

  if (keepTicking) {
    state.subsystems.scheduler.requestRender();
  } else if (selectIsLiveTicking(rootState)) {
    // The scene is otherwise at rest, but a live sim clock is advancing. Arm a
    // heartbeat (see `liveIdleTickMs` above) so the terminator stays honest
    // without pinning the loop — the scheduler ignores this while a frame is
    // already queued and never stacks timers, so it can't fight the wake path.
    const idleTickMs = liveIdleTickMs(focusedPivotAltitudeMpc);
    state.cameraRuntime.debugIdleTickMs = idleTickMs; // DebugPanel Camera section only
    state.subsystems.scheduler.requestIdleFrame(idleTickMs);
  }
}
