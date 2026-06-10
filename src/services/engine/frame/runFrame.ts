/**
 * runFrame — the per-frame body of the render loop, kept in its own
 * module so `engine.ts` stays focused on bootstrap + the public handle.
 *
 * Engine.ts is responsible for *constructing* dependencies; runFrame.ts
 * is responsible for *consuming* them.  The two concerns sit behind a
 * single seam — `RunFrameDeps` — which makes the inputs the body relies
 * on legible at a glance.
 *
 * ### What counts as the "frame body"
 *
 * Everything from the FPS sample at the top to the `renderFrame()` GPU
 * dispatch and the throttled hover pick that follows.  The
 * still-animating predicate ("keep ticking ONLY if motion or async work
 * is in flight") lives here too — a single condition that fires
 * `state.subsystems.scheduler.requestRender()` if any busy-flag is set.
 *
 * ### Why deps are passed explicitly instead of lifted to EngineState
 *
 * The IIFE-local renderers (`device`, `context`, `milkyWayRenderer`,
 * `filamentRenderer`, `texturedDiskRenderer`) are read *only* by the
 * frame body; promoting them to `state.gpu.*` would widen `EngineState`'s
 * contract for one consumer and force every other reader to null-check
 * fields it never touches.  They flow through `RunFrameDeps` instead.
 * The pure `cssToTexPx` helper captures nothing, so it's imported
 * directly rather than threaded.
 *
 * ### The `{current}` ref pattern for mutable closure values
 *
 * `lastReportedFps` is owned by `createEngine`'s closure but mutated
 * here.  Wrapping it as `{ current: T }` lets `RunFrameDeps` carry it by
 * reference: the body writes `deps.lastReportedFps.current` and engine.ts
 * sees the same object.  `fpsCounter` is passed as-is (no mutation of a
 * binding, just a method call).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import { updatePosition } from '../../camera/orbitCamera';
import { runCameraDrivers } from '../camera/cameraDrivers';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { isEngineReady } from '../helpers/engineReady';
import { pickToSelection } from '../helpers/pickToSelection';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { produceStructureMarkers } from '../presentation/produceStructureMarkers';
import { deriveFrameContext } from './frameContext';
import { deriveSourceMasks } from './deriveSourceMasks';
import { renderFrame } from './renderFrame';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../subsystems/proceduralDiskSubsystem';

/**
 * Run one frame of the render loop.  Called every rAF tick by the
 * scheduler in `state.subsystems.scheduler` (see engine.ts's
 * forward-declared `frame` binding for the wiring).
 *
 * `nowMs` is `performance.now()`-shaped; engine.ts passes that exact
 * value at the call site.  We accept it as a parameter rather than
 * reading the global so tests can drive deterministic timing.
 */
export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  // ── FPS measurement ───────────────────────────────────────────────
  //
  // Sample BEFORE any frame work so the timestamp is the gap between
  // successive rAF dispatches — what the user perceives as framerate.  The
  // counter handles its own < 2-samples bootstrap (null) and a 60-frame
  // window; we throttle the callback to integer changes so React doesn't
  // re-render on noise.
  const fpsNow = deps.fpsCounter.sample(nowMs);
  if (fpsNow !== null && fpsNow !== deps.lastReportedFps.current) {
    deps.lastReportedFps.current = fpsNow;
    deps.cb.lifecycle?.onFpsChange?.(fpsNow);
  }

  // ── Demand re-evaluation ──────────────────────────────────────────
  //
  // Re-derive what should be loading from current state, every frame.
  // The single seam that turns any state change into the right loads: a
  // handle setter flips its demand-gating state (a survey's enabled bit,
  // filaments.enabled, a structure category's visibility) and calls
  // requestRender, which wakes the loop, which runs this.  No setter has
  // to remember to trigger loading — requestRender is the universal
  // "something changed" signal it already must send.  Idle-guarded, so an
  // already loading/ready/error asset is a cheap no-op on steady-state
  // frames.  (Boot loads are kicked from wireSlots, and the
  // synthetic-fallback gate kicks its backstop directly.)
  //
  // Recompute the survey draw/pick masks from settings + live fade opacity at
  // the top of every frame, before any reader (render or pick pass) touches
  // them — so the masks are always a fresh derivation of the single source of
  // truth, never a hand-maintained mirror.  Demand itself reads settings
  // directly, not the masks.
  deriveSourceMasks(state);
  reevaluateDemand(state);

  // ── Resize the swap-chain if the canvas element changed size ──────
  //
  // `resizeCanvasToDisplay` returns `true` only when dimensions changed,
  // so we patch `cam.aspect` + the HDR/volume targets only in that branch.
  // The HDR texture is sized 1:1 with the swap chain, so a stale target
  // after resize would smear pixels or render off-canvas; the tone-map
  // pass rebuilds its bind group each frame so it picks up the new view.
  //
  // We read `state.cam` directly (not via `deriveFrameContext`) because
  // resize legitimately runs pre-bootstrap — the canvas can change size
  // before the first cloud lands, and `postProcess?.resize` tolerates a
  // null handle.  All post-bootstrap sections below funnel through `ctx`.
  if (state.cam && resizeCanvasToDisplay(deps.canvas)) {
    state.cam.aspect = deps.canvas.width / deps.canvas.height;
    updatePosition(state.cam);
    state.gpu.postProcess?.resize({ width: deps.canvas.width, height: deps.canvas.height });
    state.gpu.volumeOffscreen?.resize({
      width: deps.canvas.width,
      height: deps.canvas.height,
    });
  }

  // Emit a per-frame camera snapshot for React-side derived state
  // (scale bar today; potentially other zoom-dependent UI later).
  // Fires unconditionally while `cam` exists — React's setState
  // equality check filters unchanged snapshots, so the cost on stable
  // frames is one object alloc and one optional-chain call.  No-op
  // entirely when nobody subscribes.
  if (state.cam) {
    const snap = {
      distance: state.cam.distance,
      fovYRad: state.cam.fovYRad,
    };
    deps.cb.camera?.onCameraChange?.(snap);
  }

  // ── Camera drivers ────────────────────────────────────────────────
  //
  // One camera-write site per frame, behind the camera-driver-authority
  // model.  Every mover that wants to write the camera (raw input, an
  // in-flight tween, idle auto-rotate) is a `CameraDriver` with a numeric
  // `priority`; `runCameraDrivers` scans the list, picks the single
  // highest-priority driver that declares itself active, and runs ONLY
  // that one's `apply`.  Precedence is therefore data (priority), not
  // statement order, and there is no blending — a frame is authored by one
  // driver or by none.
  //
  // Auto-rotate is suppressed-by-tween purely through priority: the tween
  // driver outranks auto-rotate, so when a tween is active it wins and
  // auto-rotate never fires.  The old explicit `!tweens.isActive()` guard
  // that encoded the same rule is gone — the resolver subsumes it.
  //
  // This runs *before* `deriveFrameContext` so a camera-only-ready frame
  // still makes motion progress before we early-return for missing GPU
  // handles.  Cancellation (raw input cancelling an in-flight tween) is
  // unchanged and does NOT live here: the SpaceMouse subsystem fires its
  // `cancelTween` callback as part of `applyToCamera`.  The resolver only
  // arbitrates the same-frame race for who gets to write the camera.
  if (state.cam) {
    runCameraDrivers(deps.drivers, state.cam, nowMs);
  }

  // ── Per-frame derived snapshot ────────────────────────────────────
  //
  // `deriveFrameContext` runs the camera + GPU + thumbnail bootstrap gate
  // and pre-computes the view-projection matrix, camera-position tuple,
  // and pixel-per-radian scalar for downstream `renderFrame()`.  The "not
  // ready" branch is the brief window before the first cloud lands; once
  // cam + GPU handles populate together, it's never taken again.
  const ctx = deriveFrameContext(state, deps.canvas);
  if (!ctx.isReady) {
    state.subsystems.scheduler.requestRender();
    return;
  }

  // ── Structure-focus recession (computed ONCE, EARLY) ────────────────
  //
  // Focus mode fades non-member galaxies away when a cluster /
  // supercluster / void / group structure is focused.  Resolve the focused structure
  // (a bare single-click select does not count; galaxy / nothing both →
  // null) and let the subsystem diff it against its focused id to drive
  // the 400 ms member-isolation fade.
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
  const focusSel = state.subsystems.selection.focused();
  const focusedStructure =
    focusSel !== null && focusSel.kind === 'structure'
      ? (state.data.structures.byId(focusSel.id) ?? null)
      : null;
  state.subsystems.structureFocus.update(focusedStructure, nowMs);
  const focusUniforms = state.subsystems.structureFocus.produceFocusUniforms(nowMs);
  ctx.focusBlend = focusUniforms.blend;

  // ── Per-frame impostor planners ───────────────────────────────────
  //
  // CPU-side step that populates the LOD subsystems' `lastOutput` arrays,
  // which the HDR_PASSES loop reads via proceduralDisksPass /
  // texturedDisksPass.  The atlas subsystem is mutated transitively by the
  // textured-disk run (slot allocations + fetch enqueues).
  if (state.subsystems.proceduralDisks !== null) {
    state.subsystems.proceduralDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: state.sources.drawMask,
      pxPerRad: ctx.drawPxPerRad,
    });
  }
  // hiResFamous must run BEFORE texturedDisks: the textured-disk planner
  // reads hiResFamous.lastOutput.byFamousIdx and folds layer indices +
  // crossfade alphas into the DiskInstance literals it emits. Running it
  // after would lag by a frame and produce a visible flicker on close
  // approach to a famous galaxy.
  if (state.subsystems.hiResFamous !== null) {
    state.subsystems.hiResFamous.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: state.sources.drawMask,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.data.galaxies.famousMeta,
    });
  }
  if (state.subsystems.texturedDisks !== null) {
    state.subsystems.texturedDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.data.galaxies.catalogs,
      visibleSourceMask: state.sources.drawMask,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.data.galaxies.famousMeta,
    });
  }

  // ── Label director per-frame update ───────────────────────────────
  //
  // Runs BEFORE the GPU dispatch so `labelRenderer.setLabels` /
  // `markerLineRenderer.setLines` are uploaded before `renderFrame` reads
  // those buffers.  The director polls every registered `LabelProducer`
  // (youAreHere, structures, ...), merges, change-detects via signature hash,
  // and flushes once; it null-checks its renderers, so this is safe before
  // the atlas load completes.
  state.subsystems.labelDirector.runFrame(state, ctx);

  // ── Per-frame marker upload ───────────────────────────────────────
  //
  // Like the label flush above: produceStructureMarkers walks the structure
  // store, applies fade math, and hands descriptors to the renderer.  Must run
  // BEFORE the GPU dispatch so the instance buffer is uploaded before
  // structureMarkersPass reads it.  Null-checked for the pre-initGpu window.
  if (state.gpu.structureMarkerRenderer !== null) {
    const markers = produceStructureMarkers(state, ctx);
    state.gpu.structureMarkerRenderer.setMarkers(markers);
  }

  // ── GPU dispatch ──────────────────────────────────────────────────
  //
  // The whole encoder lifecycle (createCommandEncoder, beginRenderPass
  // against the HDR target, the draws, postProcess.draw, queue.submit)
  // lives in `renderFrame.ts`; every value it reads is forwarded as a
  // field on `RenderFrameInput` so this site stays free of GPU bookkeeping.
  renderFrame({
    ctx,
    state,
    device: deps.device,
    context: deps.context,
    milkyWayRenderer: deps.milkyWayRenderer,
    horizonShellRenderer: deps.horizonShellRenderer,
    filamentRenderer: deps.filamentRenderer,
    scalarVolumeRenderer: state.gpu.scalarVolumeRenderer,
    flowFieldRenderer: state.gpu.flowFieldRenderer,
    texturedDiskRenderer: deps.texturedDiskRenderer,
    proceduralDiskRenderer: deps.proceduralDiskRenderer,
    milkyWayITimeSec: (performance.now() - deps.milkyWayITimeEpochMs) * 0.001 * 0.25,
    settings: {
      pointSizePx: state.settings.surveys.sizePx,
      brightness: state.settings.surveys.brightness,
      selected: state.subsystems.selection.selected(),
      visibleSourceMask: state.sources.drawMask,
      highlightFallback: state.settings.surveys.highlightFallback,
      realOnlyMode: state.settings.surveys.realOnly,
      biasMode: state.settings.bias.mode,
      absMagLimit: state.settings.bias.absMagLimit,
      apparentMagLimit: state.bias.apparentMagLimit,
      schechterMStar: state.bias.schechterMStar,
      schechterAlpha: state.bias.schechterAlpha,
      depthFadeEnabled: state.settings.surveys.depthFade,
      // Same crossfade band the procedural-disk pass fades IN over, so the
      // two passes blend cleanly without a double-bright donut.  Constants
      // are the single source of truth in `proceduralDiskSubsystem.ts`.
      pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
      // Live cluster-focus uniform (blend ramps 0↔1 over 400 ms; at rest
      // blend=0 → shader no-op).  Reuses the value computed once at the top
      // of the frame — NOT a fresh produceFocusUniforms call, which would
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

  // ── Pick-buffer debug overlay ─────────────────────────────────────
  //
  // Populate the pick texture (no readback) and composite a colour-mapped
  // overlay over the swap chain.  Sequencing matters:
  //   - AFTER renderFrame's submit so the shared uniform buffer reflects
  //     this frame's visual state (queue.writeBuffer is ordered per submit).
  //   - BEFORE the hover pick so both writers see a known texture state.
  //   - Own encoder/submit with `loadOp: 'load'` so the pre-multiplied
  //     OVER blend composites on top of the tone-mapped frame.
  if (
    state.settings.debug.showPickBuffer &&
    state.gpu.pickRenderer !== null &&
    state.gpu.pickDebugOverlay !== null &&
    state.data.galaxies.catalogs.size > 0 &&
    ctx.isReady
  ) {
    const { visibleSources: overlaySources, hasAny } = collectPickTargets(
      ctx.renderer,
      state.sources.pickMask,
      state.gpu.structureMarkerRenderer,
    );
    if (hasAny) {
      const pickTex = state.gpu.pickRenderer.renderForDebug(
        [deps.canvas.width, deps.canvas.height],
        overlaySources,
        state.settings.surveys.sizePx,
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

  // ── Throttled hover pick ──────────────────────────────────────────
  //
  // pointermove updates `state.picking.latestMouseCss`; once per frame we
  // kick off a pick if the mouse moved and none is already in flight.
  // Movement is detected by object-reference inequality (the pointermove
  // handler allocates a fresh position object).
  //
  // Fire-and-forget: awaiting inside rAF would block the loop, so the
  // `.then` updates state when the GPU readback lands (1-2 frames later).
  //
  // IMPORTANT: pick() runs *after* device.queue.submit(), so the visual
  // frame's uniform buffer already holds the latest viewProj — and the
  // pick renderer reads that same buffer.
  if (
    state.data.galaxies.catalogs.size > 0 &&
    state.picking.latestMouseCss !== null &&
    state.picking.latestMouseCss !== state.picking.lastPickedMouseCss &&
    !state.picking.pickInFlight &&
    !state.picking.pointerDown && // skip hover picks while a drag is in progress
    // `ctx.isReady` already proved cam/renderer/postProcess/thumbnails
    // are non-null.  `isEngineReady` is the same predicate plus
    // pickRenderer, which lets us drop the `state.gpu.pickRenderer!`
    // non-null assertion below.  The two checks always agree by
    // construction (same five fields, populated together in
    // bootstrap, nulled together in destroy).
    isEngineReady(state)
  ) {
    // Snapshot what's pickable this frame — visible galaxy surveys
    // (filtered by the pick mask, same rule as the click handler) plus
    // whether any cluster ring is on screen.  Single source of truth so
    // the hover gate, the pick-debug overlay, and the click resolver all
    // agree on "is there anything to pick".
    const { visibleSources, hasAny } = collectPickTargets(
      ctx.renderer,
      state.sources.pickMask,
      state.gpu.structureMarkerRenderer,
    );
    if (!hasAny) {
      // Nothing pickable (every survey off AND no cluster ring visible).
      // Let the loop sleep — the next setSourceVisible / structure-marker
      // change wakes it.  This `return` skips the keep-rendering predicate
      // at the tail, which is correct: with nothing pickable there's
      // nothing to animate, so the predicate would return false anyway.
      return;
    }

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
        state.settings.surveys.sizePx,
        // Optional GPU-timing descriptor for the hover-pick pass.
        // Undefined unless `?gpuTimings` is set; the click path in
        // clickHandler.ts wires this the same way.  Slot (18, 19) is
        // resolved by the next main-frame `endFrame`.
        state.gpu.timingService.descriptorFor('pick'),
      )
      .then((pick) => {
        // Decode the pick to a hover `Selection` (galaxy / structure / null) via the
        // shared map — the same one the click path uses, so hover and click
        // can't drift. One slot: setHovered(null) clears, a galaxy or structure hit
        // replaces; setHovered equality-short-circuits, so a steady hover is a
        // no-op. The InfoCard reads the resolved target.
        state.subsystems.selection.setHovered(pickToSelection(pick, state.data.structures));
        // No scheduler.requestRender() here intentionally.
        // The hover state only feeds the React InfoCard text —
        // there is no hover halo in the rendered scene today,
        // so a hover change does NOT require a re-render.
        // Skipping the wake keeps idle CPU at zero on
        // mouse-over without click.  If a future task adds a
        // hover halo, add scheduler.requestRender() here.
      })
      .finally(() => {
        state.picking.pickInFlight = false;
      });
  }

  // ── Render-on-demand: continue ticking ONLY if motion or async
  // work is in flight.  Otherwise the loop sleeps; event handlers and
  // engine handle setters call scheduler.requestRender() to wake it one
  // frame each.
  //
  // Predicate breakdown:
  //   - camera drivers active: any camera mover (raw input, an in-flight
  //     tween, or idle auto-rotate) declares itself active this frame, via
  //     the same driver registry the per-frame camera write resolves
  //     through.  `.some(d => d.isActive(nowMs))` IS the boolean OR of
  //     those movers, so it tracks the resolver exactly — one place decides
  //     "is the camera moving" for both the write and the keep-ticking gate.
  //   - texturedDisks.hasInFlightWork(): a thumbnail fetch is racing the
  //     network OR a landed bitmap is in its 400 ms load-fade window.  The
  //     onResult calls requestRender(), but we keep a frame queued anyway
  //     so the fade lerp ramps smoothly.
  //   - fades.isAnyAnimating(): a survey / filament handle is ramping its
  //     opacity from a recent upload (the FadeRegistry owns every clock,
  //     filaments included).
  //   - structureFocus.isAwake(): the member-isolation fade (its own
  //     controller, not in the registry) across the 400 ms ramp.
  //   - flowFieldRenderer.isAnimating(): the flow layer is enabled + loaded;
  //     both modes animate (advect drifts, streamline pulses), so the loop
  //     must keep ticking while flow is on. isAnimating already folds in the
  //     settings.flow.enabled check.
  //
  // `isEngineReady` consolidates the bootstrap-bag null guard: when ready,
  // all those fields are simultaneously non-null, so we dereference
  // texturedDisks without a bespoke check.
  const ready = isEngineReady(state);
  // Tick the FadeRegistry BEFORE isAnyAnimating: tick is the single
  // resolution site for fadeTo promises, so without it the awaited
  // fade-out in setSourceVisible / tier-swap commit would hang forever.
  state.subsystems.fades.tick(nowMs);
  const stillAnimating =
    deps.drivers.some((d) => d.isActive(nowMs)) ||
    (ready && state.subsystems.texturedDisks.hasInFlightWork()) ||
    state.subsystems.fades.isAnyAnimating(nowMs) ||
    state.subsystems.structureFocus.isAwake(nowMs) ||
    state.gpu.flowFieldRenderer?.isAnimating(state.settings.flow) === true;
  if (stillAnimating) state.subsystems.scheduler.requestRender();
}
