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
 * GPU dispatch and the throttled hover pick that follows. The still-animating
 * predicate ('keep ticking ONLY if motion or async work is in flight') lives
 * here too — a single condition that fires `scheduler.requestRender()` if any
 * busy-flag is set.
 *
 * ### Why deps are passed explicitly instead of lifted to EngineState
 *
 * The IIFE-local renderers (`device`, `context`, `milkyWayRenderer`,
 * `filamentRenderer`, `texturedDiskRenderer`) are read *only* by the frame body;
 * promoting them to `state.gpu.*` would widen `EngineState`'s contract for one
 * consumer and force every other reader to null-check fields it never touches.
 * They flow through `RunFrameDeps` instead. The pure `cssToTexPx` helper
 * captures nothing, so it's imported directly rather than threaded.
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
 *   3. COMMIT-ON-EDGE: if the winning driver CHANGED AWAY FROM 'tween' or
 *      'autoRotate', fold the last produced pose into `base` exactly once.
 *      `orbitDrag` and `resting` are excluded (orbitDrag commits via
 *      `onGestureEnd`; resting's pose IS `base`).
 *   4. UPDATE Resources: `prevActiveId.current = activeId`,
 *      `lastPose.current = pose`.
 *
 * Then `deriveFrameContext` receives the already-produced `pose` and the live
 * `projection` Resource, assembles a full `OrbitCamera`, and computes vp etc.
 * The clock is advanced exactly once per frame by step 1's `runCameraDrivers`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import { runCameraDrivers, pickWinner } from '../camera/cameraDrivers';
import { activeDriverId } from '../camera/activeDriverId';
import { tweenElapsed } from '../camera/cameraClock';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { isEngineReady } from '../helpers/engineReady';
import { shouldKeepTicking } from '../helpers/shouldKeepTicking';
import { resolvePick } from '../helpers/resolvePick';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { milkyWayPickVisible } from '../helpers/milkyWayPickVisible';
import { produceStructureMarkers } from '../presentation/produceStructureMarkers';
import { deriveFrameContext } from './frameContext';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { commitCameraPose, cancelCameraTween } from '../../../state/camera/cameraSlice';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../subsystems/proceduralDiskSubsystem';
import { updateSelectionHover } from '../../../state/selection/selectionSlice';

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
  // Must run AFTER the pose is produced (so `pose` already == evaluateTween(to)
  // via saturation at elapsed >= durationMs) and BEFORE commit-on-edge sees the
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
  // Fires when the active driver CHANGED AWAY FROM a tween or autoRotate driver.
  // `orbitDrag` and `resting` are deliberately excluded:
  //   - orbitDrag commits via `onGestureEnd` (the synchronous DOM handler),
  //     which bakes the final cam pose before the next frame sees dragging=false.
  //   - resting's pose IS base; committing it is a noise-write.
  //
  // `lastPose.current` at this point holds the PREVIOUS frame's pose (it has
  // not been updated for this frame yet — that happens in step 4). So when the
  // tween deactivates on frame N, `lastPose` holds frame N-1's saturated pose
  // (== desc.to exactly), and that is what lands in `base`. Exactly one commit,
  // exactly at the `desc.to` value.
  const { lastPose, prevActiveId } = state.cameraRuntime;
  const prev = prevActiveId.current;
  if (prev !== activeId && (prev === 'tween' || prev === 'autoRotate')) {
    deps.cb.store.dispatch(commitCameraPose(lastPose.current));
  }

  // ── (4) UPDATE Resources for next frame ───────────────────────────────────
  //
  // `prevActiveId` and `lastPose` are updated AFTER the commit-on-edge so the
  // commit correctly reads the PREVIOUS frame's values.
  prevActiveId.current = activeId;
  lastPose.current = pose;

  // Emit a per-frame camera snapshot for React-side derived state (scale bar
  // today; potentially other zoom-dependent UI later). Fires unconditionally
  // while the engine is ready — React's setState equality check filters
  // unchanged snapshots, so the cost on stable frames is one object alloc and
  // one optional-chain call. Distance comes from the produced pose (not
  // `state.cam`, the stale drag register); fovYRad from the projection Resource.
  // state.cam non-null is the bootstrap-ready proxy here — the snapshot values come from lastPose + projection, not from state.cam.
  if (state.cam) {
    const snap = {
      distance: lastPose.current.distance,
      fovYRad: state.cameraRuntime.projection.fovYRad,
    };
    deps.cb.camera?.onCameraChange?.(snap);
  }

  // ── Per-frame derived snapshot ────────────────────────────────────────────
  //
  // `deriveFrameContext` receives the already-produced `pose` and the live
  // `projection` Resource, assembles the full OrbitCamera, and pre-computes the
  // view-projection matrix, camera-position tuple, and pixel-per-radian scalar
  // for downstream `renderFrame()`. The 'not ready' branch is the brief window
  // before the first cloud lands; once cam + GPU handles populate together,
  // it's never taken again.
  const ctx = deriveFrameContext(state, deps.canvas, pose, state.cameraRuntime.projection);
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
    settings: {
      pointSizePx: state.settings.galaxyCatalogs.sizePx,
      brightness: state.settings.galaxyCatalogs.brightness,
      selected: state.selection.select,
      visibleSourceMask: masks.draw,
      highlightFallback: state.settings.galaxyCatalogs.highlightFallback,
      realOnlyMode: state.settings.galaxyCatalogs.realOnly,
      biasMode: state.settings.bias.mode,
      absMagLimit: state.settings.bias.absMagLimit,
      depthFadeEnabled: state.settings.galaxyCatalogs.depthFade,
      // Same crossfade band the procedural-disk pass fades IN over, so the two
      // passes blend cleanly without a double-bright donut. Constants are the
      // single source of truth in `proceduralDiskSubsystem.ts`.
      pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
      // Live cluster-focus uniform (blend ramps 0↔1 over 400 ms; at rest
      // blend=0 → shader no-op). Reuses the value computed once at the top of
      // the frame — NOT a fresh produceFocusUniforms call, which would
      // double-tick the fade controller.
      focus: focusUniforms,
      exposure: state.settings.tonemap.exposure,
      toneMapCurve: state.settings.tonemap.curve,
      galaxyTexturesEnabled: state.settings.thumbnails.enabled,
      milkyWayEnabled: state.settings.milkyWay.enabled,
      filamentsEnabled: state.settings.filaments.enabled,
      filamentIntensity: state.settings.filaments.intensity,
      volumesEnabled: state.settings.volumes.enabled,
    },
    famousMeta: state.data.galaxies.famousMeta,
    catalogs: state.data.galaxies.catalogs,
    timingService: deps.timingService,
  });

  // ── Pick-buffer debug overlay ─────────────────────────────────────────────
  //
  // Populate the pick texture (no readback) and composite a colour-mapped
  // overlay over the swap chain. Sequencing matters:
  //   - AFTER renderFrame's submit so the shared uniform buffer reflects this
  //     frame's visual state (queue.writeBuffer is ordered per submit).
  //   - BEFORE the hover pick so both writers see a known texture state.
  //   - Own encoder/submit with `loadOp: 'load'` so the pre-multiplied OVER
  //     blend composites on top of the tone-mapped frame.
  if (
    state.settings.debug.showPickBuffer &&
    state.gpu.pickRenderer !== null &&
    state.gpu.pickDebugOverlay !== null &&
    state.data.galaxies.catalogs.size > 0 &&
    ctx.isReady
  ) {
    const { visibleSources: overlaySources, hasAny } = collectPickTargets(
      ctx.renderer,
      masks.pick,
      state.gpu.structureMarkerRenderer,
      milkyWayPickVisible(state),
    );
    if (hasAny) {
      const pickTex = state.gpu.pickRenderer.renderForDebug(
        [deps.canvas.width, deps.canvas.height],
        overlaySources,
        state.settings.galaxyCatalogs.sizePx,
      );
      if (pickTex !== null) {
        const overlayEncoder = deps.device.createCommandEncoder({
          label: 'pick-debug-overlay-encoder',
        });
        const swapView = deps.context.getCurrentTexture().createView();
        const overlayPass = overlayEncoder.beginRenderPass({
          label: 'pick-debug-overlay-pass',
          colorAttachments: [
            {
              view: swapView,
              // `load` — preserve the tone-mapped frame underneath; the
              // overlay's pre-multiplied OVER blend composites on top.
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
        });
        state.gpu.pickDebugOverlay.draw(overlayPass, pickTex.createView());
        overlayPass.end();
        deps.device.queue.submit([overlayEncoder.finish()]);
      }
    }
  }

  // ── Throttled hover pick ──────────────────────────────────────────────────
  //
  // pointermove updates `state.picking.latestMouseCss`; once per frame we kick
  // off a pick if the mouse moved and none is already in flight. Movement is
  // detected by object-reference inequality (the pointermove handler allocates
  // a fresh position object).
  //
  // Fire-and-forget: awaiting inside rAF would block the loop, so the `.then`
  // updates state when the GPU readback lands (1-2 frames later).
  //
  // IMPORTANT: pick() runs *after* device.queue.submit(), so the visual frame's
  // uniform buffer already holds the latest viewProj — and the pick renderer
  // reads that same buffer.
  if (
    state.data.galaxies.catalogs.size > 0 &&
    state.picking.latestMouseCss !== null &&
    state.picking.latestMouseCss !== state.picking.lastPickedMouseCss &&
    !state.picking.pickInFlight &&
    !state.picking.pointerDown && // skip hover picks while a drag is in progress
    // `ctx.isReady` already proved cam/renderer/postProcess/thumbnails are
    // non-null. `isEngineReady` is the same predicate plus pickRenderer, which
    // lets us drop the `state.gpu.pickRenderer!` non-null assertion below. The
    // two checks always agree by construction (same five fields, populated
    // together in bootstrap, nulled together in destroy).
    isEngineReady(state)
  ) {
    // Snapshot what's pickable this frame — visible galaxy catalogs (filtered
    // by the pick mask, same rule as the click handler) plus whether any
    // cluster ring is on screen. Single source of truth so the hover gate, the
    // pick-debug overlay, and the click resolver all agree on 'is there
    // anything to pick'.
    const { visibleSources, hasAny } = collectPickTargets(
      ctx.renderer,
      masks.pick,
      state.gpu.structureMarkerRenderer,
      milkyWayPickVisible(state),
    );
    // Only kick off a GPU pick when something is pickable (a visible galaxy
    // catalog or an on-screen cluster ring). When nothing is, we skip the pick
    // but must NOT return — control has to reach the keep-ticking tail so
    // animated overlays (the flow field) keep the loop alive even with every
    // galaxy catalog hidden. Pickability and frame-liveness are independent:
    // an early return here once froze the flow field whenever the cursor
    // stopped over the canvas or moved onto a panel.
    if (hasAny) {
      // Snapshot the position at the moment we kick off the pick.
      const pos = state.picking.latestMouseCss;
      state.picking.lastPickedMouseCss = pos;
      state.picking.pickInFlight = true;

      state.gpu.pickRenderer
        .pick(
          [deps.canvas.width, deps.canvas.height],
          cssToTexPx(pos.x),
          cssToTexPx(pos.y),
          visibleSources,
          // Boost the picking floor for easier hover targets — see
          // PICK_PADDING_PX in pickRenderer.ts.
          state.settings.galaxyCatalogs.sizePx,
          // Optional GPU-timing descriptor for the hover-pick pass. Undefined
          // unless `?gpuTimings` is set; the click path in clickHandler.ts
          // wires this the same way. When present, the descriptor binds the
          // shared query set's 'pick' slot pair; the resolve+copy rides on the
          // NEXT main-frame `endFrame`, so cross-frame latency is at most one
          // main frame.
          state.gpu.timingService.descriptorFor('pick'),
        )
        .then((pick) => {
          // Decode the pick to a SelectionRef (identity) via `resolvePick` —
          // the same boundary the click path uses, so hover and click can't
          // drift. Dispatch to the store; the reconciler fills `selectionRows`.
          // The reducer dedupes on structural equality, so a steady hover is
          // a no-op and downstream sagas don't re-fire.
          deps.cb.store.dispatch(
            updateSelectionHover(resolvePick(pick, { structures: state.data.structures })),
          );
          // No scheduler.requestRender() here intentionally. The hover state
          // only feeds the React InfoCard text — there is no hover halo in the
          // rendered scene today, so a hover change does NOT require a
          // re-render. Skipping the wake keeps idle CPU at zero on mouse-over
          // without click. If a future task adds a hover halo, add
          // scheduler.requestRender() here.
        })
        .finally(() => {
          state.picking.pickInFlight = false;
        });
    }
  }

  // ── Render-on-demand: continue ticking ONLY if motion or async work is in
  // flight. Otherwise the loop sleeps until a channel mouth wakes it: input,
  // a fade or tween start, a slot reaching ready, a selection/focus change,
  // or a settings write. `shouldKeepTicking` owns the full predicate (camera
  // drivers, in-flight thumbnails, fades, structure-focus, animated flow) and
  // is deliberately independent of what is pickable — see its module header.
  //
  // This MUST be reached every ready frame, which is why the hover-pick block
  // above skips the pick with `if (hasAny)` rather than an early `return`.
  //
  // Tick the FadeRegistry BEFORE the predicate reads isAnyAnimating: tick is
  // the single resolution site for fadeTo promises, so without it the awaited
  // fade-out in galaxy-catalog visibility changes and tier-swap commits would
  // hang forever.
  state.subsystems.fades.tick(nowMs);
  if (shouldKeepTicking(state, deps.drivers, rootState, nowMs)) {
    state.subsystems.scheduler.requestRender();
  }
}
