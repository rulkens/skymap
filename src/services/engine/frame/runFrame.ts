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

import { runCameraDrivers } from '../camera/cameraDrivers';
import { activeDriverId } from '../camera/activeDriverId';
import { applyFocusedBodyPivot } from '../camera/applyFocusedBodyPivot';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { tweenElapsed, accumulateFollowPan, frameTweenElapsed } from '../camera/cameraClock';
import { resolveFrameBasis } from '../camera/resolveFrameBasis';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
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
} from '../../../state/camera/cameraSlice';
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
 * Idle-tick cadence for a LIVE sim clock, in milliseconds. Live time advances
 * one sim day per real day, so the terminator sweeps `0.00417° * T` of ground
 * per tick of length T — on screen that maps to pixels via `2 * h * tan(fovY /
 * 2)` (h = camera altitude) over the canvas's pixel height.
 *
 * The altitude term is what makes the cadence tight: at the 127 km standoff
 * over streamed surface tiles the viewport spans only ~147 km vertically, so a
 * 3 s tick is a visible ~8 px jump on a ~900 px-tall canvas. 500 ms holds that
 * drift under 1.5 px at every reachable altitude — ground drift scales
 * linearly with tick length, screen-space drift inversely with altitude.
 *
 * Kept OUT of `shouldKeepTicking` regardless: pinning the loop at 60 fps for a
 * rotation this slow would burn the GPU for no visible gain, so instead we ask
 * the scheduler for ONE frame per tick — a heartbeat that keeps the terminator
 * honest while the loop sleeps in between. The React TimeBar readout runs its
 * own timer, so this heartbeat serves only the 3D scene.
 *
 * A `setInterval` would be the wrong tool: it fires unconditionally, fighting
 * render-on-demand and double-scheduling whenever a real wake (drag, fade) is
 * already driving the loop. The scheduler's `requestIdleFrame` instead arms a
 * single one-shot that self-cancels once fired and is ignored while a rAF frame
 * is already queued — so it only ever supplies the frames the busy loop didn't.
 */
const LIVE_IDLE_TICK_MS = 500;

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
  if (state.cam) {
    // Pre-bootstrap `cam` is null; a grab is impossible until wireInput attaches
    // controls, so there is no decode to keep in sync until then.
    state.cam.poseBasis = poseBasis;
    state.cam.upBasis = upBasis;
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
  // The pose this frame actually renders. Normally the freshly produced pose;
  // on a deactivation edge it is overridden to the just-committed pose (below).
  let renderPose = pose;
  if (prev !== activeId && deps.drivers.find((d) => d.id === prev)?.commitsOnEdge) {
    deps.cb.store.dispatch(commitCameraPose(lastPose.current));
    // Commit-on-edge fires AFTER produce, so the produce step above ran the
    // INCOMING driver against the PRE-commit `base`. For a driver that reads
    // `base` (resting / autoRotate) that pose is the stale pre-edge value —
    // rendering it flashes the camera back to where the tween, spin, or clip
    // started for one frame. `lastPose.current` is the animation's final pose
    // and the value we just baked into `base`, so render THAT this frame instead.
    renderPose = lastPose.current;
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
  // A right-drag STRAFE while following is folded into the clock's world-frame
  // `followPanOffset` FIRST (a follow-drag frame is orbitDrag winning over a body
  // focus), then the pin resolves the pivot to `bodyPosition + followPanOffset`.
  // The offset — not `cam.target`, which the pin overwrites — is the strafe's home,
  // so the shifted pivot still translate-follows the body and a fresh focus zeroes
  // it (in `followElapsed`).
  // Read the pivot focus off `rootState` (the SAME store snapshot the drivers
  // resolved against this frame), so the pin and the winner never disagree on
  // what is focused. A separate `focusRow` local below reads the EngineState
  // mirror for the structure-focus / time-report sections.
  const pivotFocus = rootState.selectionRows.focus;
  const clock = state.cameraRuntime.clock;
  const followingBody = bodyMovesThisFrame(pivotFocus);
  if (state.cam) {
    accumulateFollowPan(clock, activeId === 'orbitDrag' && followingBody, state.cam.target);
  } else {
    // Pre-bootstrap: no cam, no drag possible — keep the delta chain reset.
    clock.lastPanTarget = null;
  }
  renderPose = applyFocusedBodyPivot(
    renderPose,
    deps.drivers.find((d) => d.id === activeId)?.pivotsOnFocusedBody ?? false,
    pivotFocus,
    simDays,
    clock.followPanOffset,
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
    // The committed pose basis (holds still through a roll) and the live up
    // basis (rolls) — the same split fed to the drag register above, so the
    // draw decode shares both poles with the switch surfaces.
    poseBasis,
    upBasis,
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
        const { cut, requests } = cutSurfaceTiles({
          ...params,
          camPosLocal: prepared.camLocal,
          viewProjLocal: prepared.mvpLocal,
          viewportPx: view.viewportPx,
          residentSlot: earthTiles.residentSlot,
        });
        earthTiles.update({ plan: requests, nowMs: ctx.nowMs });
        earthTiles.setLastCut(cut);
      }
    }
  }

  // Read OUTSIDE the gate above: `isAnimating()` is true while the manifest is
  // in flight, a state entered BEFORE the subsystem can ever engage — voting
  // only on engaged frames would let a stopped camera sleep the loop mid-fetch.
  const earthTilesAnimating = earthTiles?.isAnimating() ?? false;

  // ── Label director per-frame update ──────────────────────────────────────
  //
  // Runs BEFORE the GPU dispatch so `labelRenderer.setLabels` /
  // `markerLineRenderer.setLines` are uploaded before `renderFrame` reads those
  // buffers. The director polls every registered `LabelProducer` (milkyWayLabel,
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
    // coarse heartbeat (see LIVE_IDLE_TICK_MS) so the terminator stays honest
    // without pinning the loop — the scheduler ignores this while a frame is
    // already queued and never stacks timers, so it can't fight the wake path.
    state.subsystems.scheduler.requestIdleFrame(LIVE_IDLE_TICK_MS);
  }
}
