/**
 * runFrame — the per-frame body of the render loop, lifted out of
 * `engine.ts` into its own module.
 *
 * ### Why the frame body lives in its own file
 *
 * `engine.ts` was a 2300-line single-file orchestrator before Spec B's
 * internal restructure carved it up.  The per-frame body — ~310 lines
 * spanning FPS sampling, camera advance, auto-LOD, GPU dispatch, and the
 * throttled hover-pick — was a third of that line count.  Wholesale
 * inlining made the file's *one* easy-to-grep landmark ("where does the
 * loop tick?") hard to find under the mass of bootstrap, slot wiring,
 * and public-handle setters.
 *
 * Moving the body to a sibling file gives every reader a 1:1 mapping
 * from "what runs every frame" to "this module".  Engine.ts stays
 * responsible for *constructing* the dependencies; runFrame.ts is
 * responsible for *consuming* them.  The two concerns now sit behind a
 * single seam — `RunFrameDeps` — which makes the inputs the body relies
 * on legible at a glance.
 *
 * ### What counts as the "frame body"
 *
 * Everything from the FPS sample at the top to the `renderFrame()` GPU
 * dispatch and the throttled hover pick that follows.  The
 * still-animating "keep ticking ONLY if motion or async work is in
 * flight" predicate also lives in here today — it's just a single
 * condition that fires `state.subsystems.scheduler.requestRender()` if
 * any of the busy-flags are still set, with no separate scheduler-tail
 * helper to factor out.  If a future phase wants to extract that tail
 * into its own helper, do it then; YAGNI for now.
 *
 * The bootstrap IIFE that *assigns* `frame = () => { runFrame(...) }`
 * stays in engine.ts because it captures the GPU device/context and the
 * renderer instances (`milkyWayRenderer`, `quadRenderer`, …) that
 * `initGpu()` returns asynchronously.  Those instances flow through
 * `RunFrameDeps` rather than living on `EngineState` — see the
 * dep-vs-state rationale below.
 *
 * ### Why deps are passed explicitly instead of lifted to EngineState
 *
 * Two reasons.  First, the IIFE-local renderers (`device`, `context`,
 * `milkyWayRenderer`, `filamentRenderer`, `quadRenderer`, `diskRenderer`)
 * are *only* read by the frame body — promoting them to `state.gpu.*`
 * would widen `EngineState`'s contract for one consumer's convenience,
 * and every other reader of `EngineState` would have to null-check
 * fields it never touches.  Second, the createEngine-scope helpers
 * (`updateScaleBar`, `setHovered`, `cssToTexPx`) close over locals like
 * `lastScaleSig`, `selectionEq`, and `pointInfoForSelection` that are
 * inherently per-engine-instance and don't belong in `EngineState`'s
 * data-shape role either.  Threading them through deps preserves the
 * existing closure structure without forcing a state-bag rewrite.
 *
 * ### The `{current}` ref pattern for mutable closure values
 *
 * The frame body reads-and-writes `lastReportedFps` (a closure-captured
 * `let` in createEngine).  After the relocation the body lives in a
 * different module, so the `let` no longer round-trips through closure.
 * The fix is to wrap the value as `{ current: T }` — a one-field box —
 * which `RunFrameDeps` carries by reference.  The body reads
 * `deps.lastReportedFps.current` and writes
 * `deps.lastReportedFps.current = newValue`; engine.ts sees the same
 * object and observes the writes.
 *
 * Note that `lastScaleSig` (also a `let` in createEngine) does NOT
 * become a ref: it's read/written only inside `updateScaleBar()`, which
 * we pass through deps as a function value.  The function captures
 * `lastScaleSig` via its own closure, so the body never needs to touch
 * it directly.  Same story for `fpsCounter` (a `const` whose
 * `.sample()` method is called once at the top of the body) — pass the
 * counter object itself, no ref-ification needed.
 */

import type { EngineCallbacks, EngineState } from '../../@types';
import type { Source } from '../../data/sources';
import type { QuadRenderer } from '../gpu/quadRenderer';
import type { DiskRenderer } from '../gpu/diskRenderer';
import type { MilkyWayRenderer } from '../gpu/milkyWayRenderer';
import type { FilamentRenderer } from '../gpu/filamentRenderer';
import type { FpsCounter } from './fpsCounter';

import { computeViewProj, updatePosition } from '../camera/orbitCamera';
import { resizeCanvasToDisplay } from '../gpu/device';
import { autoLodMask } from './helpers/autoLod';
import { renderFrame } from './renderFrame';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from './thumbnailSubsystem';

/**
 * Closure captures the per-frame body relies on.  Every entry here was
 * a free reference in the original `engine.ts:1407–1708` body; the
 * survey done in Phase 3 Task 3.1 enumerated each one by source
 * (createEngine arg, IIFE-local renderer, createEngine helper, etc.)
 * and confirmed read-only vs. mutated.  `lastReportedFps` is the only
 * mutated entry, hence the `{current}` box.
 */
export type RunFrameDeps = {
  /** createEngine arg — for resize + viewport reads. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — for `onFpsChange` / `onSourceMaskChange` echoes. */
  cb: EngineCallbacks;
  /** Rolling 60-frame counter; `.sample()` called once per frame. */
  fpsCounter: FpsCounter;
  /**
   * Mutable: last integer fps value reported via `cb.onFpsChange`.
   * Boxed as `{current}` so the body's write round-trips back into
   * createEngine's scope across the module boundary.  See the module
   * header for the why.
   */
  lastReportedFps: { current: number | null };
  /** GPU device handle from `initGpu`. */
  device: GPUDevice;
  /** Swap-chain context handle from `initGpu`. */
  context: GPUCanvasContext;
  /** Milky-Way impostor renderer; instantiated inside the IIFE. */
  milkyWayRenderer: MilkyWayRenderer;
  /** Filament renderer; instantiated inside the IIFE. */
  filamentRenderer: FilamentRenderer;
  /** Textured-quad renderer for galaxy thumbnails. */
  quadRenderer: QuadRenderer;
  /** 3D-oriented disk renderer for large galaxies. */
  diskRenderer: DiskRenderer;
  /**
   * Wall-clock epoch (ms, from `performance.now`) snapshot taken at
   * engine construction; used to derive the Milky Way impostor's iTime
   * each frame.
   */
  milkyWayITimeEpochMs: number;
  /** CSS-pixel → texture-space-pixel conversion (DPR-aware). */
  cssToTexPx: (cssPx: number) => number;
  /**
   * Notify the UI that the hovered point changed.  Closes over
   * `state.picking.hovered`, `cb.onHoverChange`, and the
   * pointInfoForSelection helper inside createEngine.
   */
  setHovered: (sel: { source: Source; localIdx: number } | null) => void;
  /**
   * Refresh the scale-bar legend.  Internally dedups via a closure-
   * captured `lastScaleSig` so an unchanged label costs ~zero per
   * frame.
   */
  updateScaleBar: () => void;
};

/**
 * Run one frame of the render loop.  Called every rAF tick by the
 * scheduler in `state.subsystems.scheduler` (see engine.ts's
 * forward-declared `frame` binding for the wiring).
 *
 * `nowMs` is `performance.now()`-shaped; engine.ts passes that exact
 * value at the call site.  We accept it as a parameter rather than
 * reading the global so tests can drive deterministic timing.
 *
 * The body is lifted *verbatim* from engine.ts — no behavioural changes,
 * no renames, no refactors.  The only edits relative to the original
 * are: (a) closure references rewritten as `deps.*`, (b) the mutable
 * `lastReportedFps` rewritten as `deps.lastReportedFps.current`.
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
    deps.cb.onFpsChange?.(fpsNow);
  }

  // Snapshot the live state references once at the top of the
  // frame body for readability.  Each is either a live mutable
  // value (cam) or a slot that becomes null only on `destroy()`
  // (renderer, thumbnails) — so reading through the snapshots
  // for the duration of one frame is identical to reading
  // `state.*` everywhere.
  const camRef = state.cam;

  // Resize the swap-chain if the canvas element changed size.
  // `resizeCanvasToDisplay` returns `true` only when dimensions changed,
  // so we patch `cam.aspect` and `updatePosition` only in that branch.
  //
  // We also recreate the HDR target at the new viewport size in the
  // same branch.  The HDR texture is sized 1:1 with the swap chain,
  // so a stale (smaller / larger) HDR target after a resize would
  // either smear pixels or render off-canvas.  The tone-map pass
  // recreates its bind group every frame, so the new view is picked
  // up automatically on the next call.
  if (camRef && resizeCanvasToDisplay(deps.canvas)) {
    camRef.aspect = deps.canvas.width / deps.canvas.height;
    updatePosition(camRef);
    state.gpu.postProcess?.resize({ width: deps.canvas.width, height: deps.canvas.height });
  }

  // Refresh the scale-bar legend. Early-returns when nothing changed,
  // so this costs ~zero on stable frames.
  deps.updateScaleBar();

  // ── Focus / home tween ────────────────────────────────────────────
  //
  // If a tween is in flight the manager advances it.  `advance`
  // mutates the camera state and calls updatePosition internally,
  // so by the time we hit the auto-rotate block below the camera
  // is already at the eased intermediate frame.  The manager
  // auto-clears its internal reference when the tween finishes,
  // so subsequent frames skip this branch via `isActive()` returning
  // false.
  if (camRef) {
    state.subsystems.tweens.advance(camRef, performance.now());
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
  if (camRef) {
    state.subsystems.spaceMouse.applyToCamera(camRef, performance.now());
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
  if (state.settings.autoRotate && camRef && !state.subsystems.tweens.isActive()) {
    camRef.yaw += 0.000873;
    updatePosition(camRef);
  }

  // Snapshot the current camera state into a combined view-projection matrix.
  const vp = camRef ? computeViewProj(camRef) : null;
  const rendererRef = state.gpu.renderer;
  const thumbnailsRef = state.subsystems.thumbnails;
  const postProcessRef = state.gpu.postProcess;
  if (!vp || !rendererRef || !camRef || !thumbnailsRef || !postProcessRef) {
    // Camera/renderer not ready yet — try again next frame.
    // (This branch only fires during the brief window between
    // engine startup and the first cloud landing; once both are
    // present it's never taken.)
    //
    // We additionally guard on `thumbnails` being non-null so the
    // renderFrame() dispatch below can take the subsystem
    // unconditionally.  The subsystem is allocated alongside the
    // GPU device in the startup IIFE, so by the time this branch
    // is reachable both are present together.  The `cam` guard
    // is redundant with the `vp` check (vp is null when cam is)
    // but kept explicit so the type narrowing flows cleanly into
    // the renderFrame call.
    state.subsystems.scheduler.requestRender();
    return;
  }

  // ── Auto-LOD mask refresh ────────────────────────────────────────
  //
  // In auto mode, recompute which surveys are visible from the
  // camera's current distance every frame.  The work is essentially
  // free — `autoLodMask` is a few branches against constants — and
  // we only fire `onSourceMaskChange` when the mask actually flips
  // bands so React's setState isn't called every frame.
  //
  // In manual mode we leave `visibleMask` alone so a user toggle
  // in the settings panel sticks until they explicitly re-enter
  // auto mode.
  if (state.sources.lodMode === 'auto') {
    const nextMask = autoLodMask(camRef.distance);
    if (nextMask !== state.sources.visibleMask) {
      state.sources.visibleMask = nextMask;
      deps.cb.onSourceMaskChange?.(nextMask);
    }
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
    cam: camRef,
    canvasWidth: deps.canvas.width,
    canvasHeight: deps.canvas.height,
    viewProj: vp,
    device: deps.device,
    context: deps.context,
    postProcess: postProcessRef,
    pointRenderer: rendererRef,
    milkyWayRenderer: deps.milkyWayRenderer,
    filamentRenderer: deps.filamentRenderer,
    thumbnails: thumbnailsRef,
    quadRenderer: deps.quadRenderer,
    diskRenderer: deps.diskRenderer,
    milkyWayITimeSec: (performance.now() - deps.milkyWayITimeEpochMs) * 0.001 * 0.25,
    settings: {
      pointSizePx: state.settings.pointSizePx,
      brightness: state.settings.brightness,
      selected: state.picking.selected,
      visibleSourceMask: state.sources.visibleMask,
      highlightFallback: state.settings.highlightFallback,
      realOnlyMode: state.settings.realOnlyMode,
      biasMode: state.bias.mode,
      absMagLimit: state.bias.absMagLimit,
      apparentMagLimit: state.bias.apparentMagLimit,
      schechterMStar: state.bias.schechterMStar,
      schechterAlpha: state.bias.schechterAlpha,
      depthFadeEnabled: state.settings.depthFadeEnabled,
      // Task 8 of procedural-disk-impostor: feed the points-pass
      // fragment shader the same crossfade band the procedural-
      // disk pass fades IN over, so the two passes blend cleanly
      // without a double-bright donut.  Constants live in
      // `thumbnailSubsystem.ts` as a single source of truth.
      pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
      exposure: state.settings.exposure,
      toneMapCurve: state.settings.toneMapCurve,
      galaxyTexturesEnabled: state.settings.galaxyTexturesEnabled,
      milkyWayEnabled: state.settings.milkyWayEnabled,
      filamentsEnabled: state.settings.filamentsEnabled,
      filamentIntensity: state.settings.filamentIntensity,
    },
    famousMeta: state.sources.famousMeta,
    famousXrefs: state.sources.famousXrefs,
    clouds: state.sources.clouds,
  });

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
    state.sources.clouds.size > 0 &&
    state.picking.latestMouseCss !== null &&
    state.picking.latestMouseCss !== state.picking.lastPickedMouseCss &&
    !state.picking.pickInFlight &&
    !state.picking.pointerDown // skip hover picks while a drag is in progress
  ) {
    // Snapshot the renderer's currently-visible per-source draw
    // records.  Same filter rule as the click handler — only sources
    // whose visibility bit is set are eligible to claim hover.
    const visibleSources = Array.from(rendererRef.loadedSources()).filter(
      (s) => ((state.sources.visibleMask >> s.source) & 1) !== 0,
    );
    if (visibleSources.length === 0) {
      // No surveys are visible right now (user toggled them all
      // off).  Let the loop sleep — the next setSourceVisible
      // call will wake it.
      //
      // By design: this `return` skips the keep-rendering predicate
      // at the end of runFrame.  That's correct — with zero visible
      // surveys there's nothing to animate, and the predicate would
      // only ever return false in this state anyway.  Acknowledged
      // here because the early-out is now far enough from the
      // predicate that the asymmetry isn't visually obvious.
      return;
    }

    // Snapshot the position at the moment we kick off the pick.
    const pos = state.picking.latestMouseCss;
    state.picking.lastPickedMouseCss = pos;
    state.picking.pickInFlight = true;

    state.gpu
      .pickRenderer!.pick(
        [deps.canvas.width, deps.canvas.height],
        deps.cssToTexPx(pos.x),
        deps.cssToTexPx(pos.y),
        visibleSources,
        // Boost the picking floor for easier hover targets — see
        // PICK_PADDING_PX in pickRenderer.ts.
        state.settings.pointSizePx,
      )
      .then((sel) => {
        deps.setHovered(sel);
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
  //   - pointRenderer.isFading() / filamentRenderer.isFading():
  //     one or more clouds (point surveys or the filament skeleton)
  //     are still ramping up their per-source opacity from a recent
  //     upload (initial load or tier-swap).  The fade lasts
  //     CLOUD_FADE_DURATION_MS (~600 ms) total; we keep ticking the
  //     loop so the smoothstep advances on every frame, then go
  //     silent again.  See `cloudFade.ts` for the shared mechanism.
  const stillAnimating =
    state.settings.autoRotate ||
    state.subsystems.tweens.isActive() ||
    state.subsystems.spaceMouse.hasAxes() ||
    (state.subsystems.thumbnails !== null &&
      state.subsystems.thumbnails.hasInFlightFetches()) ||
    (state.gpu.renderer !== null && state.gpu.renderer.isFading()) ||
    (state.gpu.filamentRenderer !== null && state.gpu.filamentRenderer.isFading());
  if (stillAnimating) state.subsystems.scheduler.requestRender();
}
