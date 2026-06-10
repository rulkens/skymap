/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit
 * camera, click + double-click handlers, the input-bindings listener
 * bag, and the initial settings-callback fan-out.
 *
 * Runs without waiting on any survey load: the camera framing uses pure
 * constants from `cameraFraming.ts`, so the orbit camera and the loop
 * can come up immediately and surveys can fade in as they arrive. The
 * `ready` status emission lives in `wireSlots` as a per-arrival
 * subscriber.
 *
 * ### State writes
 *
 *   - `state.cam`, `state.initialCamSnapshot`.
 *   - `state.gpu.pickRenderer`.
 *   - `state.subsystems.clickResolver`, `state.subsystems.inputBindings`.
 *   - Fans out via `seedSettingsCallbacks` to every echoed `cb.on*Change`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.detachControlsRef.current` — written with the
 *     orbit-controls detach function.
 */

import { createOrbitCamera } from '../../camera/orbitCamera';
import { attachOrbitControls } from '../../camera/orbitControls';
import { createPickRenderer } from '../../gpu/renderers/pickRenderer';
import { createClickResolver } from '../interaction/clickHandler';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera } from '../camera/cameraFraming';
import { seedSettingsCallbacks } from '../wiring/seedSettingsCallbacks';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { collectPickTargets } from '../helpers/collectPickTargets';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 3: pick renderer + camera + orbit controls + click
 * handlers + input bindings + status-ready + settings seed.
 */
export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas, cb } = deps;

  // Build the pick renderer. It shares the same vertex/uniform buffers as
  // the visual renderer — no extra GPU memory for point data.
  const renderer = state.gpu.renderer;
  if (!renderer) return;
  // Thread the cluster marker renderer through so the pick pass can
  // append structure ring draws after the galaxy per-source loop — see the
  // structure ring block inside `pick()` for the depth-ordering rationale.  Normalise
  // `null` → `undefined` so the renderer's param type stays `| undefined`
  // and the optional-vs-null distinction stays internal to the handle bag.
  const pickRenderer = createPickRenderer(
    deps.phaseLocals!.device,
    renderer,
    state.gpu.fadeBgl!,
    state.gpu.sourceBgl!,
    state.gpu.focusBgl!,
    // The live shared focus buffer — so the pick pass excludes non-members
    // of a focused structure from hit-testing (vertex shader culls them).
    state.gpu.focusUniform!.bindGroup,
    state.gpu.structureMarkerRenderer ?? undefined,
    state.gpu.proceduralDiskRenderer ?? undefined,
  );
  state.gpu.pickRenderer = pickRenderer;
  // The resolver hands back the freshly-decoded `(source, localIdx)`
  // straight from the picker; the engine's only job is to look up
  // the matching cloud and bounds-check the localIdx against the
  // data-side map's count.  The bounds check defends the tier-swap
  // race (in-flight pick decoded against a now-shrunk cloud) — same
  // guard the selection subsystem applies before building a
  // GalaxyInfo for a callback fan-out.
  state.subsystems.clickResolver = createClickResolver({
    pickRenderer,
    // The structure store the resolver reads to turn a ring hit into a
    // structure selection (via `pickToSelection`, shared with the hover path).
    structures: state.data.structures,
  });

  // ── Camera auto-framing ──────────────────────────────────────────────
  //
  // Pure constants — see `cameraFraming.ts`. No dependency on loaded
  // catalogs, so the camera is built before any survey has arrived.
  const fovYRad = (Math.PI / 180) * 60;
  const initialCam = computeInitialCamera({ fovYRad });

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
  // Capture the framing values so `resetCamera()` can restore them later.
  // We mirror the helper's output rather than re-reading from `cam` so
  // later camera reconfigures (e.g. user FOV changes) don't drift the
  // reset target.  `aspect` is intentionally not captured — reset uses the
  // *current* canvas aspect so the projection survives a window resize.
  //
  // `target` is cloned into a fresh tuple because `createOrbitCamera`'s
  // shallow spread makes `cam.target` and `initialCam.target` alias the
  // SAME array; every later focusOn / tween / pan mutates `cam.target` in
  // place, which would otherwise corrupt the snapshot into "reset to the
  // last-focused galaxy" instead of the catalog origin.  Cloning here is a
  // one-line fix; fixing it at the spread site ripples through the
  // OrbitCamera contract.
  state.initialCamSnapshot = {
    ...initialCam,
    target: [initialCam.target[0], initialCam.target[1], initialCam.target[2]],
  };

  // ── Pointer / keyboard / resize listeners ────────────────────────────
  //
  // Centralised in `inputBindings.ts` so every DOM listener the
  // engine cares about lives in one module.  Each callback below
  // is the *semantic* engine action — the inputBindings module
  // already converts `e.clientX/Y` to a CSS-pixel record and owns
  // the requestRender wake for channel-uncovered events (see its
  // module header for the contract).
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    // Scheduler by reference — created eagerly in the state literal (the
    // forward-declared `frame` binding handles the construction-vs-body
    // chicken-and-egg).
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
    // Esc is an explicit dismiss: clear BOTH the selection (close the
    // card) and the focus slot (collapse the cluster-focus fade).
    // Self-contained at the engine level so it doesn't depend on the
    // React Esc path — App.tsx also forwards Esc through the handle's
    // `clearSelection()` (→ clearAll), which does the same two clears;
    // both setters dedupe, so the double-fire is a no-op.
    onEscape: () => {
      state.subsystems.selection.setSelected(null);
      state.subsystems.selection.setFocused(null);
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

  // Shared pick body for single-click.  Inline rather than module-level
  // because it closes over `state` and `canvas`.
  const runPickAtCss = (
    xCss: number,
    yCss: number,
  ): ReturnType<NonNullable<typeof state.subsystems.clickResolver>['resolveClick']> | null => {
    const r = state.gpu.renderer;
    const cr = state.subsystems.clickResolver;
    if (!r || state.data.galaxies.catalogs.size === 0 || !cr) return null;

    // Snapshot what's pickable — visible galaxy surveys (filtered by the
    // pick mask; a fading-out layer clears its bit immediately so it
    // can't claim a click while still visually fading) plus whether any
    // cluster ring is on screen.  Shared with the hover + pick-debug
    // gates via collectPickTargets so all three agree.
    const { visibleSources, hasAny } = collectPickTargets(
      r,
      state.sources.pickMask,
      state.gpu.structureMarkerRenderer,
    );
    if (!hasAny) return null;

    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
      viewportPx: [canvas.width, canvas.height],
      visibleSources,
      // Threaded through so the pick pass can boost its floor size
      // for easier click targets — see PICK_PADDING_PX in pickRenderer.ts.
      pointSizePx: state.settings.surveys.sizePx,
      // Per-pass GPU timing.  Resolves to `undefined` when the
      // timing service isn't active on this adapter (no
      // `timestamp-query` feature) — in that case the pick render
      // pass falls back to its pre-timing descriptor shape.  When
      // present, the descriptor binds the shared query set's 'pick'
      // slot pair; the resolve+copy rides on the NEXT main-frame
      // `endFrame`, so cross-frame latency is at most one main frame.
      timingDescriptor: state.gpu.timingService.descriptorFor('pick'),
    });
  };

  deps.detachControlsRef.current = attachOrbitControls(canvas, cam, {
    onCameraChange: () => {
      // Camera moved — wake the render loop for one frame.
      // Scale-bar refresh and the pick gate run inside the next
      // frame body.
      state.subsystems.scheduler.requestRender();
    },
    onClick: (xCss, yCss) => {
      // Run a one-shot pick at the click position.  We don't use
      // the throttle guard here — clicks are infrequent and we
      // want an immediate, synchronous-feeling response.
      const pick = runPickAtCss(xCss, yCss);
      if (!pick) return;
      pick.then((sel) => {
        // Single-click is pure selection (null clears) for both galaxy and
        // structure hits. setSelected resolves the target internally, fires
        // onSelectChange so the React InfoCard swaps bodies, and owns the
        // render wake.
        state.subsystems.selection.setSelected(sel);
      });
    },
    onDoubleClick: () => {
      // Upgrade the current selection to a focus. The preceding single-clicks
      // already pinned it, so we read the authoritative selection slot rather
      // than running a second pick (racing readbacks resolve out of order) or
      // caching a resolved copy. A null target means empty-space: release the
      // focus slot so the cluster-focus fade lifts. `handle` is resolved
      // lazily through `deps.handleRef`, non-null by the time a user can
      // dblclick.
      const handle = deps.handleRef.current;
      const target = state.subsystems.selection.selectedTarget();
      if (target) {
        handle?.camera.focusOn(target);
        return;
      }
      // setFocused owns the wake when the slot actually changes.
      state.subsystems.selection.setFocused(null);
    },
  });

  // ── Seed settings callbacks ───────────────────────────────────────────
  //
  // Fire each optional settings callback once with the engine's default so
  // React's initial state matches the engine truth.  Without this, App.tsx
  // would only update on the first user interaction, showing stale values
  // if any default drifts between engine and component.  The fan-out lives
  // in `seedSettingsCallbacks.ts`.
  seedSettingsCallbacks(cb, {
    pointSize: state.settings.surveys.sizePx,
    brightness: state.settings.surveys.brightness,
    autoRotate: state.settings.camera.autoRotate,
    galaxyTexturesEnabled: state.settings.thumbnails.enabled,
    highlightFallback: state.settings.surveys.highlightFallback,
    realOnlyMode: state.settings.surveys.realOnly,
    depthFadeEnabled: state.settings.surveys.depthFade,
    showPickBuffer: state.settings.debug.showPickBuffer,
    showDiskRadiusRing: state.settings.debug.showDiskRadiusRing,
    biasMode: state.settings.bias.mode,
    absMagLimit: state.settings.bias.absMagLimit,
    toneMapCurve: state.settings.tonemap.curve,
    exposure: state.settings.tonemap.exposure,
    // drawMask (not pickMask) for the UI seed — they're identical at
    // bootstrap, but drawMask tracks what the user actually sees, which is
    // the semantics the UI is built against.
    visibleSourceMask: state.sources.drawMask,
  });
}
