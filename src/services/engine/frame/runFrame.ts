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
 * The IIFE-local renderers (`device`, `context`, `milkyWayRenderer`,
 * `filamentRenderer`, `texturedDiskRenderer`) are read *only* by the frame body;
 * promoting them to `state.gpu.*` would widen `EngineState`'s contract for one
 * consumer and force every other reader to null-check fields it never touches.
 * They flow through `RunFrameDeps` instead.
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
import { tweenElapsed } from '../camera/cameraClock';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { produceStructureMarkers } from '../presentation/produceStructureMarkers';
import { deriveFrameContext } from './frameContext';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { drawPickDebugOverlay } from './drawPickDebugOverlay';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { commitCameraPose, cancelCameraTween } from '../../../state/camera/cameraSlice';
import { computeScaleInfo } from '../helpers/scaleBar';
import { engineScaleChanged } from '../../../state/engine/engineSlice';

/**
 * Desired scale-bar width in CSS pixels. The engine computes this per-frame
 * and dispatches the result to the store, so every consumer (ScaleBar, tour
 * sagas) reads a consistent value without a React-side computation callback.
 * 150 px is the design choice: wide enough to read, narrow enough to never
 * collide with the InfoCard.
 */
const SCALE_TARGET_PX = 150;

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

  // ── Resize → projection Resource ─────────────────────────────────────────
  //
  // `resizeCanvasToDisplay` returns `true` only when dimensions changed, so we
  // patch `cameraRuntime.projection.aspect` + the HDR/volume targets only in
  // that branch. The HDR texture is sized 1:1 with the swap chain, so a stale
  // target after resize would smear pixels or render off-canvas; the tone-map
  // pass rebuilds its bind group each frame so it picks up the new view.
  //
  // Aspect lives on `projection` (the engine Resource), NOT on `state.cam`.
  // `state.cam` is the drag register; its `aspect` field is set at bootstrap
  // and is never read for the rendered frame — `assembleOrbitCamera` merges the
  // projection Resource's aspect onto every produced pose instead.
  //
  // Resize can run pre-bootstrap (the canvas can change size before the first
  // cloud lands) — `projection` is always non-null, so no guard is needed.
  if (resizeCanvasToDisplay(deps.canvas)) {
    state.cameraRuntime.projection.aspect = deps.canvas.width / deps.canvas.height;
    state.gpu.postProcess?.resize({ width: deps.canvas.width, height: deps.canvas.height });
    state.gpu.volumeOffscreen?.resize({
      width: deps.canvas.width,
      height: deps.canvas.height,
    });
    // foregroundComposite + debugSphereRenderer are viewport-independent:
    // the former receives the colour view per-draw; the latter draws indexed
    // geometry that is not sized to the viewport.  Only foregroundOffscreen
    // carries canvas-sized textures and needs resizing here.
    state.gpu.foregroundOffscreen?.resize({
      width: deps.canvas.width,
      height: deps.canvas.height,
    });
  }

  // ── Camera produce → commit-on-edge ──────────────────────────────────────
  //
  // Single camera-write site per frame. The produce step calls `runCameraDrivers`
  // (which calls `pickWinner` and the winner's `pose`), then the tween-completion
  // and commit-on-edge steps gate on the active driver identity. The four steps
  // run before `deriveFrameContext` so a camera-only-ready frame still makes
  // motion progress before we early-return for missing GPU handles.
  const rootState = deps.cb.store.getState();

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
    masks.draw,
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

  // ── Per-frame impostor planners ───────────────────────────────────────────
  //
  // CPU-side step that populates the LOD subsystems' `lastOutput` arrays, which
  // the HDR_PASSES loop reads via proceduralDisksPass / texturedDisksPass. The
  // atlas subsystem is mutated transitively by the textured-disk run (slot
  // allocations + fetch enqueues).
  if (state.subsystems.proceduralDisks !== null) {
    state.subsystems.proceduralDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
    });
  }
  // hiResFamous must run BEFORE texturedDisks: the textured-disk planner reads
  // hiResFamous.lastOutput.byFamousIdx and folds layer indices + crossfade
  // alphas into the DiskInstance literals it emits. Running it after would lag
  // by a frame and produce a visible flicker on close approach to a famous galaxy.
  if (state.subsystems.hiResFamous !== null) {
    state.subsystems.hiResFamous.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.data.galaxies.famousMeta,
    });
  }
  if (state.subsystems.texturedDisks !== null) {
    state.subsystems.texturedDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: masks.draw,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.data.galaxies.famousMeta,
    });
  }

  // ── Label director per-frame update ──────────────────────────────────────
  //
  // Runs BEFORE the GPU dispatch so `labelRenderer.setLabels` /
  // `markerLineRenderer.setLines` are uploaded before `renderFrame` reads those
  // buffers. The director polls every registered `LabelProducer` (milkyWayLabel,
  // structures, ...), merges, change-detects via signature hash, and flushes
  // once; it null-checks its renderers, so this is safe before the atlas load
  // completes.
  state.subsystems.labelDirector.runFrame(state, ctx);

  // ── Per-frame marker upload ───────────────────────────────────────────────
  //
  // Like the label flush above: produceStructureMarkers walks the structure
  // store, applies fade math, and hands descriptors to the renderer. Must run
  // BEFORE the GPU dispatch so the instance buffer is uploaded before
  // structureMarkersPass reads it. Null-checked for the pre-initGpu window.
  if (state.gpu.structureMarkerRenderer !== null) {
    const markers = produceStructureMarkers(state, ctx);
    state.gpu.structureMarkerRenderer.setMarkers(markers);
  }

  // ── GPU dispatch ──────────────────────────────────────────────────────────
  //
  // The whole encoder lifecycle (createCommandEncoder, beginRenderPass against
  // the HDR target, the draws, postProcess.draw, queue.submit) lives in
  // `renderFrame.ts`; every value it reads is forwarded as a field on
  // `RenderFrameInput` so this site stays free of GPU bookkeeping.
  renderFrame({
    ctx,
    state,
    device: deps.device,
    context: deps.context,
    milkyWayRenderer: deps.milkyWayRenderer,
    horizonShellRenderer: deps.horizonShellRenderer,
    filamentRenderer: deps.filamentRenderer,
    volumeFieldRenderer: state.gpu.volumeFieldRenderer,
    flowFieldRenderer: state.gpu.flowFieldRenderer,
    texturedDiskRenderer: deps.texturedDiskRenderer,
    proceduralDiskRenderer: deps.proceduralDiskRenderer,
    milkyWayITimeSec: (performance.now() - deps.milkyWayITimeEpochMs) * 0.001 * 0.25,
    timingService: deps.timingService,
  });

  // ── Pick-buffer debug overlay ─────────────────────────────────────────────
  //
  // Composite a colour-mapped pick-buffer overlay over the swap chain.
  // Runs AFTER renderFrame's submit (the packed uniform bytes are stashed
  // by pointSpritesPass just before that submit). The helper owns its own
  // encoder/submit with `loadOp: 'load'` so the OVER blend composites on
  // top of the tone-mapped frame without re-rendering the scene.
  //
  // Hover picking is now fully pointer-driven (hoverPickDriver, wired in
  // wireInput.ts) — there is no longer an in-frame pick block here.
  drawPickDebugOverlay(state, deps, masks);

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
  if (shouldKeepTicking(state, rootState, nowMs)) {
    state.subsystems.scheduler.requestRender();
  }
}
