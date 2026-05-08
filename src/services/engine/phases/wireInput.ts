/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit
 * camera, click + double-click handlers, the input-bindings listener
 * bag, the initial settings-callback fan-out, and the ready-state
 * status callback.
 *
 * ### What this phase does
 *
 *   - Computes the camera bbox from `state.sources.clouds` (must be
 *     non-empty by the time we reach here — `wireSlots` awaited the
 *     all-arrivals gate).
 *   - Constructs the orbit camera with the bbox-derived framing.
 *     Stored on `state.cam`.
 *   - Captures an immutable copy of the framing as
 *     `state.initialCamSnapshot` for `resetCamera()` to restore later.
 *     The `target` tuple is deliberately cloned because
 *     `createOrbitCamera`'s shallow spread aliases it with the live
 *     `cam.target` — see the inline comment for the reset-camera bug
 *     this avoided.
 *   - Builds the pick renderer (shares vertex/uniform buffers with the
 *     visual renderer — no extra GPU memory).  Stored on
 *     `state.gpu.pickRenderer`.
 *   - Builds the click resolver (decodes pick readbacks into
 *     `(source, localIdx, cloud)` and hands back a PointInfo).  Stored
 *     on `state.subsystems.clickResolver`.
 *   - Attaches `inputBindings` (pointer/keyboard/resize listener bag).
 *     Stored on `state.subsystems.inputBindings`.
 *   - Attaches orbit controls with click + double-click handlers; the
 *     dblclick handler reuses a closure-local `lastClickedInfo` cache
 *     instead of running a second pick (race history in the inline
 *     comment).  The detach function is written to
 *     `deps.detachControlsRef` so `engine.ts`'s `destroy()` can release
 *     the listeners.
 *   - Fires `cb.onStatusChange({ kind: 'ready', ... })` with the count
 *     across every loaded survey at this moment.
 *   - Seeds React with the engine's default values for every echoed
 *     setting via `seedSettingsCallbacks`.
 *
 * ### Why this runs third (after wireSlots, before startLoop)
 *
 * The bbox loop reads `state.sources.clouds` — populated by the
 * per-source slot commit subscribers wired in `initGpu` and triggered
 * by `wireSlots`.  Without `wireSlots` having awaited the all-arrivals
 * gate, the bbox would be 0 (no clouds yet) and the camera framing
 * would be nonsense.
 *
 * `startLoop` runs after this phase because the `RunFrameDeps` bag it
 * builds includes `cb`, `device`, `context`, the renderers, plus the
 * helpers that close over `state.cam` (which we constructed here).
 *
 * ### State writes
 *
 *   - `state.cam`, `state.initialCamSnapshot`.
 *   - `state.gpu.pickRenderer`.
 *   - `state.subsystems.clickResolver`, `state.subsystems.inputBindings`.
 *   - `cb.onStatusChange({ kind: 'ready', ... })`.
 *   - Fans out via `seedSettingsCallbacks` to every echoed `cb.on*Change`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.detachControlsRef.current` — written with the
 *     orbit-controls detach function.
 *
 * ### Async work
 *
 * None — every call here is synchronous.  The phase is `async` only
 * to match the orchestrator's `Phase` signature.
 *
 * ### Early-return semantics
 *
 * If `state.sources.clouds.size === 0` (every load failed and the
 * synthetic fallback also produced nothing), this phase returns
 * early.  Same condition as the pre-Phase-5 IIFE's mid-IIFE `return`
 * at the corresponding line.  `startLoop` checks the same condition
 * and bails too — the engine sits in 'loading' state with nothing to
 * render and no input wired.
 */

import { Source } from '../../../data/sources';
import { createOrbitCamera } from '../../camera/orbitCamera';
import { attachOrbitControls } from '../../camera/orbitControls';
import { createPickRenderer } from '../../gpu/renderers/pickRenderer';
import { createClickResolver } from '../interaction/clickHandler';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera } from '../camera/cameraFraming';
import { buildPointInfo, maxAbsCoord } from '../helpers/pointInfoBuilder';
import { seedSettingsCallbacks } from '../wiring/seedSettingsCallbacks';
import { cloudSourceFor } from '../../../data/cloudSource';
import { cssToTexPx } from '../helpers/cssToTexPx';

import type { EngineState, PointInfo } from '../../../@types';
import type { BootstrapDeps } from './bootstrap';

/**
 * Bootstrap phase 3: pick renderer + camera + orbit controls + click
 * handlers + input bindings + status-ready + settings seed.
 */
export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas, cb } = deps;

  // Bail if no clouds reached the GPU (engine torn down mid-load,
  // or synthetic upload failed).  Without at least one cloud the
  // bbox computation below has nothing to size the camera against.
  if (state.sources.clouds.size === 0) return;

  // Build the pick renderer. It shares the same vertex/uniform buffers as
  // the visual renderer — no extra GPU memory for point data.
  const renderer = state.gpu.renderer;
  if (!renderer) return;
  // `phaseLocals.device` was set by `initGpu`.  We don't need it
  // here directly — pickRenderer sources its device from the
  // PointRenderer's bound device — but we still bail if it's
  // somehow unset (defensive).
  const pickRenderer = createPickRenderer(deps.phaseLocals!.device, renderer);
  state.gpu.pickRenderer = pickRenderer;
  // The resolver hands back the freshly-decoded `(source, localIdx)`
  // straight from the picker; the engine's only job is to look up
  // the matching cloud and bounds-check the localIdx against the
  // data-side map's count.  The bounds check defends the tier-swap
  // race (in-flight pick decoded against a now-shrunk cloud) — see
  // `selectionSubsystem.pointInfoFor` for the same guard rationale.
  state.subsystems.clickResolver = createClickResolver({
    pickRenderer,
    resolveSelection: (sel) => {
      const cloud = state.sources.clouds.get(sel.source);
      if (!cloud) return null;
      if (sel.localIdx < 0 || sel.localIdx >= cloud.count) return null;
      return { source: sel.source, localIdx: sel.localIdx, cloud };
    },
    buildPointInfo: (cloud, localIdx, src) =>
      buildPointInfo(cloud, localIdx, src, state.sources.famousMeta, state.sources.famousXrefs),
  });

  // ── Camera auto-framing ──────────────────────────────────────────────
  //
  // bbox = max abs coordinate across every loaded cloud.  Drives
  // the camera's far plane — must cover the deepest survey
  // (typically GLADE at ~1.5 Gpc).  `computeInitialCamera`
  // (cameraFraming.ts) turns it into target/distance/yaw/pitch
  // /near/far including the zoom-envelope clamp.
  let bbox = 0;
  for (const c of state.sources.clouds.values()) {
    const b = maxAbsCoord(c);
    if (b > bbox) bbox = b;
  }
  const fovYRad = (Math.PI / 180) * 60;
  const initialCam = computeInitialCamera({ bbox, fovYRad });

  const cam = createOrbitCamera({
    target: initialCam.target,
    distance: initialCam.distance,
    yaw: initialCam.yaw,
    pitch: initialCam.pitch,
    fovYRad: initialCam.fovYRad,
    aspect: canvas.width / canvas.height,
    near: initialCam.near,
    far: initialCam.far,
  });
  state.cam = cam;

  // ── Initial camera snapshot for resetCamera() ────────────────────────
  //
  // Capture the framing values now, after the cloud bbox is known, so
  // `resetCamera()` can restore them at any later time.  We mirror the
  // helper's output rather than re-reading from `cam` so future
  // reconfigures of the camera (e.g. user-driven FOV changes) don't
  // accidentally drift the reset target.  `aspect` is intentionally not
  // captured — reset uses the *current* canvas aspect so the projection
  // stays correct after a window resize.
  //
  // **Why we clone `target` into a fresh tuple:**
  //
  // `createOrbitCamera` does `{ ...init, position: vec3.create() }` —
  // a shallow spread.  That makes `cam.target` and `initialCam.target`
  // alias the SAME array object.  Every subsequent `focusOn()` /
  // tween-advance / orbit-pan call mutates `cam.target` in place via
  // vec3 ops, which also mutates `initialCam.target`.  By the time
  // `resetCamera()` later reads `state.initialCamSnapshot.target[0..2]`,
  // it's reading the most recently-focused galaxy's position back
  // into itself — i.e. the camera "resets" to whatever it was last
  // looking at, not to the catalog origin (the user-visible bug:
  // "reset camera resets the zoom level, but stays focussed on the
  // currently selected galaxy").
  //
  // Fixing it at the spread site (cloning inside `createOrbitCamera`)
  // would be the architecturally cleaner cure but ripples through the
  // OrbitCamera type contract; cloning *here* is a one-line fix that
  // restores the invariant `state.initialCamSnapshot` is meant to uphold.
  state.initialCamSnapshot = {
    ...initialCam,
    target: [initialCam.target[0], initialCam.target[1], initialCam.target[2]],
  };

  // ── Pointer / keyboard / resize listeners ────────────────────────────
  //
  // Centralised in `inputBindings.ts` so every DOM listener the
  // engine cares about lives in one module.  Each callback below
  // is the *semantic* engine action — the inputBindings module
  // already converts `e.clientX/Y` to a CSS-pixel record and
  // calls `scheduler.requestRender()` after every event so we
  // don't repeat that wake-up at every site.
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    // Pass the scheduler by reference — safe because it was created
    // eagerly in the state literal above (the forward-declared
    // `frame` binding handles the chicken-and-egg between scheduler
    // construction and frame-body availability).
    scheduler: state.subsystems.scheduler,
    // Track latest mouse position for the per-frame throttled
    // hover pick.  The pick itself is async (1-2 frames later)
    // but its .then also calls requestRender so the selection
    // halo updates as soon as the readback lands.
    onPointerMove: (cssPx) => {
      state.picking.latestMouseCss = cssPx;
    },
    // Pointer left the canvas → clear hover state.  If a point
    // is selected the card stays visible (showing the pinned
    // point) — selection state is unaffected.
    onPointerLeave: () => {
      state.picking.latestMouseCss = null;
      state.subsystems.selection.setHovered(null);
    },
    // Manual orbit controls always win — cancel any running focus
    // tween the moment the user grabs the mouse.  Otherwise the
    // tween's updatePosition would fight the orbit-controls'
    // updatePosition for the same camera each frame, producing a
    // juddery jump.  Also clear hover so the card immediately
    // reflects "nothing hovered" instead of lagging until the
    // drag ends.
    onPointerDown: () => {
      state.subsystems.tweens.cancel();
      state.picking.pointerDown = true;
      state.subsystems.selection.setHovered(null);
    },
    onPointerUp: () => {
      state.picking.pointerDown = false;
    },
    // Esc clears selection.  App.tsx also has a useEffect that
    // forwards Esc through the engine handle's `clearSelection()`
    // — same result, both paths are fine.
    onEscape: () => {
      state.subsystems.selection.setSelected(null);
    },
    // resize: the next frame's resizeCanvasToDisplay() picks up
    // the new dimensions and recreates the HDR target.  All we
    // need to do is wake the loop, which inputBindings already
    // does via `scheduler.requestRender()` — so this callback is
    // a no-op.
    onResize: () => {},
  });

  // ── Click handling ───────────────────────────────────────────────────
  //
  // Click detection is delegated to `attachOrbitControls` via the `onClick`
  // option. A "click" fires only when pointerup is within 4 CSS pixels of
  // pointerdown — pure drags (orbit gestures) are suppressed.

  // Cache of the most-recent successful click pick.  The
  // double-click handler reads from this rather than running a
  // second pick: two readbacks racing on shared GPU resources
  // produced flaky results (the dblclick readback would resolve
  // first and return `clear` while the click's resolved later
  // with the real hit).  By reusing the click's PointInfo we
  // also save one readback per double-click.
  //
  // Stored as the full PointInfo so we can pull `x/y/z` and
  // `diameterKpc` straight into `handle.focusOn` without a
  // second cloud-lookup.  Cleared on every empty-space click so
  // a dblclick on empty space doesn't trigger a stale focus.
  let lastClickedInfo: PointInfo | null = null;

  // Shared pick body — used by single-click only now (dblclick
  // reuses the cached PointInfo).  Returns the click resolver's
  // result so the caller can decide what to do with it.  Inline
  // rather than module-level because it closes over `state` and
  // `canvas` from the surrounding scope.  `cssToTexPx` is a pure
  // module function imported directly — no per-engine state, no
  // need to thread through deps.
  const runPickAtCss = (
    xCss: number,
    yCss: number,
  ): ReturnType<NonNullable<typeof state.subsystems.clickResolver>['resolveClick']> | null => {
    const r = state.gpu.renderer;
    const cr = state.subsystems.clickResolver;
    if (!r || state.sources.clouds.size === 0 || !cr) return null;

    // Snapshot the renderer's per-source draw records and filter
    // by the current visibility mask so the pick pass sees the
    // same surveys the visual pass just rendered.  We materialise
    // to an array so the iterator survives the async pick promise.
    const visibleSources = Array.from(r.loadedSources()).filter(
      (s) => ((state.sources.visibleMask >> s.source) & 1) !== 0,
    );
    if (visibleSources.length === 0) return null;

    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
      viewportPx: [canvas.width, canvas.height],
      visibleSources,
      // Threaded through so the pick pass can boost its floor size
      // for easier click targets — see PICK_PADDING_PX in pickRenderer.ts.
      pointSizePx: state.settings.pointSizePx,
    });
  };

  deps.detachControlsRef.current = attachOrbitControls(canvas, cam, {
    onCameraChange: () => {
      // Camera moved — wake the render loop for one frame.
      // Auto-LOD recompute, scale-bar refresh, and pick gate all
      // run inside the next frame body.
      state.subsystems.scheduler.requestRender();
    },
    onClick: (xCss, yCss) => {
      // Run a one-shot pick at the click position.  We don't use
      // the throttle guard here — clicks are infrequent and we
      // want an immediate, synchronous-feeling response.
      const pick = runPickAtCss(xCss, yCss);
      if (!pick) return;
      pick.then((result) => {
        // Click on empty space → clear; click on point → pin it.
        // The PointInfo on `result` is also cached for the
        // dblclick handler — see `lastClickedInfo` above for the
        // race-condition rationale.
        if (result.kind === 'clear') {
          state.subsystems.selection.setSelected(null);
          lastClickedInfo = null;
        } else {
          state.subsystems.selection.setSelected(result.selection);
          lastClickedInfo = result.info;
        }
        // Selection changed — render so the highlight halo
        // updates on the next frame.
        state.subsystems.scheduler.requestRender();
      });
    },
    onDoubleClick: () => {
      // Native dblclick fires AFTER the two preceding click
      // events.  Both have already routed through `onClick` and
      // populated `lastClickedInfo` with the hit galaxy's
      // PointInfo.  We deliberately do NOT run a second pick
      // here: two readbacks racing on the same pickRenderer
      // resources resolved out of order in practice — the
      // dblclick read returned `clear` while the click read
      // resolved later with the real hit.  Reusing the cached
      // info is correct (same coordinates + camera state, since
      // dblclick fires before any frame can shift the scene)
      // and saves a redundant readback.
      //
      // No-op when the user double-clicked empty space —
      // `lastClickedInfo` would have been cleared by the
      // single-click handler in that case, and we don't want a
      // stale focus tween toward whatever was last clicked.
      if (!lastClickedInfo) return;
      // The handle is constructed AFTER the bootstrap IIFE in
      // engine.ts; threaded through `deps.handleRef` so this
      // callback resolves it lazily — by the time a user can
      // physically double-click, the handle has been assigned.
      deps.handleRef.current?.focusOn(lastClickedInfo);
    },
  });

  // ── Status: ready ────────────────────────────────────────────────────

  // `count` here is the total number of points across every loaded
  // survey at the moment we transition to "ready".  Surveys that finish
  // loading after this point are reflected via `onCloudReady`, not via
  // an additional `onStatusChange` — the status bar's job is "we're up",
  // not "live counter".
  const firstReadySource = deps.phaseLocals!.firstReadySource;
  cb.onStatusChange({
    kind: 'ready',
    count: renderer.totalCount(),
    source: cloudSourceFor(firstReadySource ?? Source.Synthetic),
  });

  // ── Seed settings callbacks ───────────────────────────────────────────
  //
  // Fire each optional settings callback once with the engine's default
  // value so React's initial state matches the engine truth (pointSizePx
  // = 2.5, brightness = 1.0, autoRotate = false, …).  Without this seed,
  // App.tsx's React state would only update on the first explicit user
  // interaction — leaving the UI showing stale values if any default
  // ever drifts between engine and component.
  //
  // The fan-out lives in `seedSettingsCallbacks.ts`; see that module for
  // the rationale on why every engine-owned setting React mirrors goes
  // through the same single audited code path.
  seedSettingsCallbacks(cb, {
    pointSize: state.settings.pointSizePx,
    brightness: state.settings.brightness,
    autoRotate: state.settings.autoRotate,
    galaxyTexturesEnabled: state.settings.galaxyTexturesEnabled,
    highlightFallback: state.settings.highlightFallback,
    realOnlyMode: state.settings.realOnlyMode,
    depthFadeEnabled: state.settings.depthFadeEnabled,
    biasMode: state.bias.mode,
    absMagLimit: state.bias.absMagLimit,
    toneMapCurve: state.settings.toneMapCurve,
    exposure: state.settings.exposure,
    lodMode: state.sources.lodMode,
    visibleSourceMask: state.sources.visibleMask,
  });
}
