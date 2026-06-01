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
 * still-animating "keep ticking ONLY if motion or async work is in
 * flight" predicate lives in here too — a single condition that fires
 * `state.subsystems.scheduler.requestRender()` if any of the busy-flags
 * are still set.
 *
 * The bootstrap IIFE that *assigns* `frame = () => { runFrame(...) }`
 * stays in engine.ts because it captures the GPU device/context and the
 * renderer instances (`milkyWayRenderer`, `texturedDiskRenderer`, …)
 * that `initGpu()` returns asynchronously.  Those instances flow
 * through `RunFrameDeps` rather than living on `EngineState` — see the
 * dep-vs-state rationale below.
 *
 * ### Why deps are passed explicitly instead of lifted to EngineState
 *
 * The IIFE-local renderers (`device`, `context`, `milkyWayRenderer`,
 * `filamentRenderer`, `texturedDiskRenderer`) are *only* read by the
 * frame body — promoting them to `state.gpu.*` would widen
 * `EngineState`'s contract for one consumer's convenience, and every
 * other reader of `EngineState` would have to null-check fields it
 * never touches.  The pure `cssToTexPx` helper captures nothing, so
 * it's imported directly at the top of this module instead of being
 * threaded.
 *
 * ### The `{current}` ref pattern for mutable closure values
 *
 * The frame body reads-and-writes `lastReportedFps`, which is owned by
 * `createEngine`'s closure but mutated from this module.  Wrapping the
 * value as `{ current: T }` — a one-field box — lets `RunFrameDeps`
 * carry it by reference.  The body reads `deps.lastReportedFps.current`
 * and writes `deps.lastReportedFps.current = newValue`; engine.ts sees
 * the same object and observes the writes.
 *
 * `fpsCounter` (a `const` whose `.sample()` method is called once at
 * the top of the body) needs no ref-ification — we pass the counter
 * object itself.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import { updatePosition } from '../../camera/orbitCamera';
import { resizeCanvasToDisplay } from '../../gpu/device';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { isEngineReady } from '../helpers/engineReady';
import { resolvePoiFromPick } from '../helpers/resolvePoiFromPick';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { deriveFrameContext } from './frameContext';
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
  // Sample BEFORE any frame work so the recorded timestamp is the
  // gap between successive rAF dispatches — that's what the user
  // perceives as "framerate", not the gap between when the frame
  // body finishes.  The counter handles its own < 2-samples
  // bootstrap (returns null) and rolls over a 60-frame window;
  // we just throttle the callback to integer-value changes so
  // React doesn't re-render on noise.
  const fpsNow = deps.fpsCounter.sample(nowMs);
  if (fpsNow !== null && fpsNow !== deps.lastReportedFps.current) {
    deps.lastReportedFps.current = fpsNow;
    deps.cb.lifecycle?.onFpsChange?.(fpsNow);
  }

  // ── Demand re-evaluation ──────────────────────────────────────────
  //
  // Re-derive what should be loading from current state, every frame.
  // This is the single seam that turns any state change into the right
  // loads: a handle setter flips its demand-gating state (a survey's
  // drawMask bit, filaments.enabled, a structure category's visibility)
  // and calls requestRender to repaint — which wakes the loop, which
  // runs this.  No setter has to remember to trigger loading itself;
  // requestRender is the universal "something changed" signal it already
  // must send, and forgetting it visibly freezes the UI, so the load
  // trigger can't silently regress.  The walk is idle-guarded, so once
  // an asset is loading/ready/error it's skipped — a cheap no-op on the
  // steady-state frames that dominate.  (Boot kicks the initial loads
  // from wireSlots, and the synthetic-fallback gate kicks its backstop
  // directly, because both need an immediate load the next frame can't
  // wait for.)
  reevaluateDemand(state);

  // ── Resize the swap-chain if the canvas element changed size ──────
  //
  // `resizeCanvasToDisplay` returns `true` only when dimensions changed,
  // so we patch `cam.aspect` and `updatePosition` only in that branch.
  //
  // We also recreate the HDR target at the new viewport size in the
  // same branch.  The HDR texture is sized 1:1 with the swap chain,
  // so a stale (smaller / larger) HDR target after a resize would
  // either smear pixels or render off-canvas.  The tone-map pass
  // recreates its bind group every frame, so the new view is picked
  // up automatically on the next call.
  //
  // We read `state.cam` directly here (rather than going through
  // `deriveFrameContext`) because resize legitimately runs in the
  // pre-bootstrap window — the canvas can change size before the
  // first cloud lands, and the GPU postProcess `?.resize(...)` already
  // tolerates a null handle.  All the *post-bootstrap* sections
  // below funnel through the `ctx` snapshot.
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

  // ── Focus / home tween ────────────────────────────────────────────
  //
  // If a tween is in flight the manager advances it.  `advance`
  // mutates the camera state and calls updatePosition internally,
  // so by the time we hit the auto-rotate block below the camera
  // is already at the eased intermediate frame.  The manager
  // auto-clears its internal reference when the tween finishes,
  // so subsequent frames skip this branch via `isActive()` returning
  // false.
  //
  // Tween / SpaceMouse / auto-rotate all run *before* the
  // `deriveFrameContext` gate so a camera-only-ready frame (rare in
  // practice — GPU usually boots before the first cloud lands) still
  // makes forward progress on motion before we early-return for the
  // missing GPU handles.
  if (state.cam) {
    state.subsystems.tweens.advance(state.cam, performance.now());
  }

  // ── SpaceMouse per-frame application ──────────────────────────────
  //
  // The subsystem owns the whole "if puck deflected, apply axes
  // scaled by wall-clock dt, otherwise reset the dt baseline"
  // dance — including the `tweens.cancel()` precedence rule (it
  // calls back into the engine via the `cancelTween` callback we
  // wired up at construction).  Calling unconditionally is fine:
  // on a resting puck it's a single hasAnyAxis read + a null
  // assignment to the dt baseline.
  if (state.cam) {
    state.subsystems.spaceMouse.applyToCamera(state.cam, performance.now());
  }

  // ── Auto-rotate yaw ───────────────────────────────────────────────
  //
  // When autoRotate is on, advance yaw by a small amount every frame.
  // ~3°/sec at 60 Hz:  3° / 60 frames = 0.05° / frame
  //                    0.05° × (π/180) ≈ 0.000873 radians / frame.
  //
  // Note: this uses a fixed per-frame delta rather than tracking elapsed
  // wall-clock time.  At high refresh rates (120 Hz) the rotation is
  // smoother but twice as fast.  For a gentle ambient effect this is
  // an acceptable trade-off — no timer bookkeeping needed.
  //
  // **Why we skip auto-rotate while a tween is active:**
  //
  // The focus / focusOnHome tweens drive `cam.yaw` toward a target
  // value over ~600 ms.  The `tweens.advance()` call earlier in
  // this frame already mutated `cam.yaw` to its eased intermediate;
  // if we then add 0.000873 rad on top *every frame* the tween
  // runs, yaw lands ~36 frames × 0.000873 rad ≈ 1.8° past the
  // target by the time the tween completes — and continues
  // drifting forever after.  The user reports this as
  // "Reset Camera doesn't actually reset to the centre".  Gating
  // auto-rotate on `!tweens.isActive()` lets the home tween land
  // exactly on the target yaw; auto-rotate resumes from that
  // landing point on the next frame.
  if (state.settings.camera.autoRotate && state.cam && !state.subsystems.tweens.isActive()) {
    state.cam.yaw += 0.000873;
    updatePosition(state.cam);
  }

  // ── Per-frame derived snapshot ────────────────────────────────────
  //
  // `deriveFrameContext` runs the camera + GPU + thumbnail bootstrap
  // gate (formerly a 5-way `||` chain inline here) and pre-computes
  // the view-projection matrix, camera-position tuple, and pixel-
  // per-radian scalar — values that downstream `renderFrame()`
  // consumes.  The "not ready" branch is the brief window between
  // engine startup and the first cloud landing; once `state.cam`
  // and the GPU handles are populated together, this gate is
  // never taken again for the lifetime of the engine.
  const ctx = deriveFrameContext(state, deps.canvas);
  if (!ctx.isReady) {
    state.subsystems.scheduler.requestRender();
    return;
  }

  // ── Per-frame impostor planners ───────────────────────────────────
  //
  // CPU-side step that populates the two LOD-aligned subsystems'
  // `lastOutput` arrays.  The HDR_PASSES loop reads those arrays via
  // the proceduralDisksPass / texturedDisksPass entries; this call
  // site is the one place both walks happen each frame.  The atlas
  // subsystem is mutated transitively by the textured-disk run
  // (slot allocations + fetch enqueues); we don't call into it
  // directly here.
  if (state.subsystems.proceduralDisks !== null) {
    state.subsystems.proceduralDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.sources.catalogs,
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
      catalogs: state.sources.catalogs,
      visibleSourceMask: state.sources.drawMask,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.sources.famousMeta,
    });
  }
  if (state.subsystems.texturedDisks !== null) {
    state.subsystems.texturedDisks.runFrame({
      cam: ctx.cam,
      catalogs: state.sources.catalogs,
      visibleSourceMask: state.sources.drawMask,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.sources.famousMeta,
    });
  }

  // ── Label director per-frame update ───────────────────────────────
  //
  // Run BEFORE the GPU dispatch so `labelRenderer.setLabels` /
  // `markerLineRenderer.setLines` are uploaded to the GPU before
  // `renderFrame` issues the draw calls that read those buffers.  The
  // director internally null-checks its renderers, so this call is
  // safe even before the atlas load completes (the brief window between
  // engine start and initGpu finishing).
  //
  // The director polls every registered `LabelProducer` (youAreHere,
  // pois, ...), merges their outputs, change-detects via signature
  // hash, and flushes once.
  state.subsystems.labelDirector.runFrame(state, ctx);

  // ── Per-frame marker upload ───────────────────────────────────────
  //
  // Mirrors the label-director flush right above: produceMarkers walks
  // the POI list, applies fade math, and hands typed descriptors to
  // the renderer.  Must run BEFORE the GPU dispatch so the instance
  // buffer is uploaded before clusterMarkersPass's draw reads it.
  //
  // Gated on the renderer being non-null so a null GPU device (test
  // fixtures, the brief pre-initGpu window) is safe.
  if (state.gpu.clusterMarkerRenderer !== null) {
    const markers = state.subsystems.pois.produceMarkers(state, ctx);
    state.gpu.clusterMarkerRenderer.setMarkers(markers);
  }

  // ── GPU dispatch ──────────────────────────────────────────────────
  //
  // The whole encoder lifecycle (createCommandEncoder, beginRenderPass
  // against the HDR target, pointRenderer.draw, thumbnails.runFrame,
  // pass.end, postProcess.draw, queue.submit) lives in `renderFrame.ts`.
  // Every closure variable that block read is forwarded as an explicit
  // field on `RenderFrameInput` so this site stays free of GPU
  // bookkeeping.  See that module's docstring for the in-order
  // pass description and the rationale for keeping pick + auto-LOD
  // out here in `frame()`.
  renderFrame({
    ctx,
    state,
    device: deps.device,
    context: deps.context,
    milkyWayRenderer: deps.milkyWayRenderer,
    horizonShellRenderer: deps.horizonShellRenderer,
    filamentRenderer: deps.filamentRenderer,
    scalarVolumeRenderer: state.gpu.scalarVolumeRenderer,
    texturedDiskRenderer: deps.texturedDiskRenderer,
    proceduralDiskRenderer: deps.proceduralDiskRenderer,
    milkyWayITimeSec: (performance.now() - deps.milkyWayITimeEpochMs) * 0.001 * 0.25,
    settings: {
      pointSizePx: state.settings.points.sizePx,
      brightness: state.settings.points.brightness,
      selected: state.subsystems.selection.selected(),
      visibleSourceMask: state.sources.drawMask,
      highlightFallback: state.settings.points.highlightFallback,
      realOnlyMode: state.settings.points.realOnly,
      biasMode: state.settings.bias.mode,
      absMagLimit: state.settings.bias.absMagLimit,
      apparentMagLimit: state.bias.apparentMagLimit,
      schechterMStar: state.bias.schechterMStar,
      schechterAlpha: state.bias.schechterAlpha,
      depthFadeEnabled: state.settings.points.depthFade,
      // Feed the points-pass vertex shader the same crossfade band
      // the procedural-disk pass fades IN over, so the two passes
      // blend cleanly without a double-bright donut.  Constants live
      // in `proceduralDiskSubsystem.ts` as a single source of truth.
      pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
      exposure: state.settings.tonemap.exposure,
      toneMapCurve: state.settings.tonemap.curve,
      galaxyTexturesEnabled: state.settings.thumbnails.enabled,
      milkyWayEnabled: state.settings.milkyWay.enabled,
      filamentsEnabled: state.settings.filaments.enabled,
      filamentIntensity: state.settings.filaments.intensity,
      volumesEnabled: state.settings.volumes.masterEnabled,
    },
    famousMeta: state.sources.famousMeta,
    catalogs: state.sources.catalogs,
    timingService: deps.timingService,
  });

  // ── Pick-buffer debug overlay ─────────────────────────────────────
  //
  // Populate the pick texture (no readback) and composite a colour-
  // mapped overlay over the swap chain.  Sequencing matters:
  //   - AFTER renderFrame's submit so the shared uniform buffer
  //     reflects this frame's visual state (queue.writeBuffer is
  //     ordered per submit).
  //   - BEFORE the hover pick so both writers see the pick texture in
  //     a known state.
  //   - In its own encoder/submit with `loadOp: 'load'` so the
  //     pre-multiplied OVER blend composites cleanly on top of the
  //     tone-mapped frame without re-plumbing renderFrame.
  if (
    state.settings.debug.showPickBuffer &&
    state.gpu.pickRenderer !== null &&
    state.gpu.pickDebugOverlay !== null &&
    state.sources.catalogs.size > 0 &&
    ctx.isReady
  ) {
    const { visibleSources: overlaySources, hasAny } = collectPickTargets(
      ctx.renderer,
      state.sources.pickMask,
      state.gpu.clusterMarkerRenderer,
    );
    if (hasAny) {
      const pickTex = state.gpu.pickRenderer.renderForDebug(
        [deps.canvas.width, deps.canvas.height],
        overlaySources,
        state.settings.points.sizePx,
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
  // Strategy: pointermove updates `state.picking.latestMouseCss`; here
  // (once per frame) we check whether the mouse has moved since the
  // last pick. If it has AND no pick is already in flight, we kick
  // off a new one.
  //
  // We compare object references rather than coordinates — a new position
  // object was created by the pointermove handler, so reference inequality
  // means the mouse actually moved.
  //
  // The pick is fire-and-forget: we do NOT await it here. Awaiting inside
  // requestAnimationFrame would block the frame loop. Instead the `.then`
  // callback updates state when the GPU readback completes (typically 1-2
  // frames later).
  //
  // IMPORTANT: pick() is called *after* device.queue.submit(), so the
  // visual frame's uniform buffer has already been written with the latest
  // viewProj. The pick renderer reads the same uniform buffer.
  if (
    state.sources.catalogs.size > 0 &&
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
      state.gpu.clusterMarkerRenderer,
    );
    if (!hasAny) {
      // Nothing pickable right now (every galaxy survey toggled off AND
      // no cluster ring visible).  Let the loop sleep — the next
      // setSourceVisible / cluster-marker change will wake it.
      //
      // By design: this `return` skips the keep-rendering predicate
      // at the end of runFrame.  That's correct — with nothing pickable
      // there's nothing to animate, and the predicate would only ever
      // return false in this state anyway.  Acknowledged here because
      // the early-out is now far enough from the predicate that the
      // asymmetry isn't visually obvious.
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
        state.settings.points.sizePx,
        // Optional GPU-timing descriptor for the hover-pick pass.
        // Undefined unless `?gpuTimings` is set; the click path in
        // clickHandler.ts wires this the same way.  Slot (18, 19) is
        // resolved by the next main-frame `endFrame`.
        state.gpu.timingService.descriptorFor('pick'),
      )
      .then((pick) => {
        // Dispatch the picker's discriminated `PickResult` union to the
        // right hover sink:
        //   - null               → clear BOTH galaxy and POI hovers.
        //   - kind:'galaxy'      → galaxy hover (selection subsystem);
        //                          POI hover cleared.
        //   - kind:'cluster' / 'supercluster' / 'void' → POI hover
        //                          (poi subsystem, which fires
        //                          onPoiHoverChange internally);
        //                          galaxy hover cleared.
        //
        // The two sinks are mutually exclusive on every pick: a single
        // pick resolves to one fragment, so we can't hit two POIs or a
        // POI+galaxy at the same time.  Clearing the OTHER sink on
        // every dispatch keeps the InfoCard from showing stale hover
        // text when the cursor drags from a galaxy onto a ring (or
        // vice versa).  Each subsystem's setter does its own equality
        // short-circuit, so the repeated "clear the other sink" calls
        // on consecutive same-kind picks are O(1) no-ops.
        if (pick === null) {
          state.subsystems.selection.setHovered(null);
        } else if (pick.kind === 'galaxy') {
          state.subsystems.selection.setHovered({
            kind: 'galaxy',
            source: pick.source,
            localIdx: pick.localIdx,
          });
        } else {
          // POI variants (cluster / supercluster / void) — resolve via
          // the shared helper so the click and hover paths agree
          // byte-for-byte on the lookup.  An out-of-bounds index or
          // missing POI produces null; same as "no hover".
          const poi = resolvePoiFromPick(state.subsystems.pois, {
            category: pick.kind,
            poiIndex: pick.poiIndex,
          });
          state.subsystems.selection.setHovered(
            poi !== null ? { kind: 'poi', id: poi.id } : null,
          );
        }
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
  // work is in flight.  Otherwise the loop sleeps; event handlers
  // and engine handle setters call scheduler.requestRender() to
  // wake it for one frame each.
  //
  // Predicate breakdown:
  //   - autoRotate: continuous yaw advancement; render every frame.
  //   - currentTween: easeOutCubic interpolation; render until
  //     advanceCameraTween reports finished and clears the ref.
  //   - hasAnyAxis(latestSpaceMouseAxes): puck deflected; render
  //     every frame to apply the per-frame velocity.
  //   - thumbnails.hasInFlightFetches(): a thumbnail fetch is
  //     racing the network OR a recently-landed bitmap is still
  //     in its 400 ms load-fade window.  The subsystem owns both
  //     bookkeeping paths; we just OR its single boolean in.
  //     When it lands, the onResult uploads to the atlas and
  //     calls requestRender() — but we keep one frame queued
  //     anyway so the load-fade lerp ramps smoothly.
  //   - fades.isAnyAnimating(): one or more handles (point surveys or
  //     the filament skeleton) are still ramping up/down their
  //     per-source opacity from a recent upload (initial load or
  //     tier-swap).  The FadeRegistry owns every controller's animation
  //     clock after the unified-fade migration — filaments register
  //     { kind: 'filaments' } in filamentSlot, so no separate
  //     isFading() probe is needed.  We keep ticking the loop so the
  //     opacity lerp advances every frame, then go silent again when
  //     all controllers settle.
  // The bootstrap-bag fields (thumbnails, point-renderer) might still
  // be null on the very first few frames after engine construction —
  // before initGpu / wireSlots have written their handles.  `isEngineReady`
  // consolidates the guard: when the engine is ready, all bootstrap-bag
  // fields are simultaneously non-null, so we dereference them without
  // bespoke checks.
  const ready = isEngineReady(state);
  // Tick the FadeRegistry BEFORE consulting isAnyAnimating: tick is
  // the single resolution site for fadeTo promises, so without this
  // call the awaited fade-out in setSourceVisible / tier-swap commit
  // would hang forever in production.
  state.subsystems.fades.tick(nowMs);
  const stillAnimating =
    state.settings.camera.autoRotate ||
    state.subsystems.tweens.isActive() ||
    state.subsystems.spaceMouse.hasAxes() ||
    (ready && state.subsystems.texturedDisks.hasInFlightWork()) ||
    // Survey + filament fade-in / fade-out: the FadeRegistry owns every
    // handle's animation clock.
    state.subsystems.fades.isAnyAnimating(nowMs);
  if (stillAnimating) state.subsystems.scheduler.requestRender();
}
