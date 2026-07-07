/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit
 * camera, click + double-click handlers, and the input-bindings listener
 * bag.
 *
 * Runs without waiting on any galaxy catalog load: the camera framing uses pure
 * constants from `cameraFraming.ts`, so the orbit camera and the loop
 * can come up immediately and galaxy catalogs can fade in as they arrive. The
 * `ready` status emission lives in `wireSlots` as a per-arrival
 * subscriber.
 *
 * No settings seed runs here: every settings cluster lives in the
 * engine-owned store (seeded at construction from the same
 * `data/defaults.ts` values React reads through `useStore` selectors),
 * so there is no startup echo to fan out.
 *
 * ### State writes
 *
 *   - `state.cam`.
 *   - `state.gpu.pickRenderer`.
 *   - `state.subsystems.clickResolver`, `state.subsystems.inputBindings`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.detachControlsRef.current` — written with the
 *     orbit-controls detach function.
 */

import { createOrbitCamera } from '../../../utils/camera/createOrbitCamera';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import { attachOrbitControls } from '../../camera/orbitControls';
import { seedCameraFromBase } from '../../camera/seedCameraFromBase';
import { createPickRenderer } from '../../gpu/renderers/pickRenderer';
import { createClickResolver } from '../interaction/clickHandler';
import { createHoverPickDriver } from '../interaction/hoverPickDriver';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera, DEFAULT_FOV_Y_RAD } from '../camera/cameraFraming';
import { poseOf } from '../camera/poseOf';
import { projectionOf } from '../camera/projectionOf';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import { milkyWayPickVisible } from '../helpers/milkyWayPickVisible';
import { milkyWayPickHalfExtentPx } from '../helpers/milkyWayPickHalfExtentPx';
import {
  commitCameraPose,
  beginDrag,
  endDrag,
  cancelCameraTween,
} from '../../../state/camera/cameraSlice';
import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
  clearSelection,
} from '../../../state/selection/selectionSlice';
import { selectSelectedRef } from '../../../state/selection/selectors';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 3: pick renderer + camera + orbit controls + click
 * handlers + input bindings + status-ready + settings seed.
 */
export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  // The visual renderer must exist before we wire picking + the camera. The
  // `renderer` local is the null-guard subject on the next line and is captured
  // by the hover-pick `collectTargets` closure below.
  const renderer = state.gpu.renderer;
  if (!renderer) return;
  // Thread the cluster marker renderer through so the pick pass can
  // append structure ring draws after the galaxy per-source loop — see the
  // structure ring block inside `pick()` for the depth-ordering rationale.  Normalise
  // `null` → `undefined` so the renderer's param type stays `| undefined`
  // and the optional-vs-null distinction stays internal to the handle bag.
  const pickRenderer = createPickRenderer(
    deps.phaseLocals!.device,
    state.gpu.fadeBgl!,
    state.gpu.sourceBgl!,
    state.gpu.focusBgl!,
    // The live shared focus buffer — so the pick pass excludes non-members
    // of a focused structure from hit-testing (vertex shader culls them).
    state.gpu.focusUniform!.bindGroup,
    state.gpu.structureMarkerRenderer ?? undefined,
    state.gpu.proceduralDiskRenderer ?? undefined,
    // The Milky-Way pick provider + its disk-visibility-gate-and-size
    // closure.  Returns the hit billboard's half-extent in pixels (the
    // SAME apparent-px the visible selection ring uses, so the click area
    // tracks the ring) while the disk is on screen, or `null` to skip the
    // draw — the same gate `milkyWayPass.enabled` uses.  A closure over
    // `state` + `canvas` so the renderer stays free of EngineState; it
    // draws what it's told.
    state.gpu.milkyWayPickRenderer ?? undefined,
    () => milkyWayPickHalfExtentPx(state, canvas.height),
  );
  state.gpu.pickRenderer = pickRenderer;

  // ── Hover-pick driver ────────────────────────────────────────────────
  //
  // `hoverPickDriver` owns the full async hover-pick path, decoupled from
  // the render frame. A pointer move feeds `onPointerMove`; the driver
  // coalesces moves (GPU readback latency is the natural throttle),
  // fires an async pick, and dispatches the hover result to the Redux store.
  // Because hover feeds only the React InfoCard text — not a visual halo —
  // no `requestRender` is ever needed here.
  //
  // All thunks are closures over live `state` / `canvas` so viewport size,
  // sizePx setting, and pick masks are always fresh at fire time, not
  // captured as stale values at construction.
  const store = deps.cb.store;
  const hoverPickDriver = createHoverPickDriver({
    state,
    pickRenderer,
    store,
    resolveDeps: { structures: state.data.structures },
    collectTargets: () =>
      collectPickTargets(
        renderer,
        deriveSourceMasks(state).pick,
        state.gpu.structureMarkerRenderer,
        milkyWayPickVisible(state, canvas.height),
      ),
    viewportPx: () => [canvas.width, canvas.height],
    pointSizePx: () => state.settings.galaxyCatalogs.sizePx,
    timingDescriptor: () => state.gpu.timingService.descriptorFor('pick'),
  });

  // The resolver runs the whole pixel → SelectionRef boundary via
  // `resolvePick`: it decodes the pick and emits an identity ref. Galaxy
  // identity is purely positional (no cloud read at pick time); the
  // reconciler resolves the cloud at display time. Structure hits resolve
  // the pick index to the record's durable id via the structure store.
  state.subsystems.clickResolver = createClickResolver({
    pickRenderer,
    structures: state.data.structures,
  });

  // ── Camera auto-framing ──────────────────────────────────────────────
  //
  // Pure constants — see `cameraFraming.ts`. No dependency on loaded
  // catalogs, so the camera is built before any galaxy catalog has arrived.
  const fovYRad = DEFAULT_FOV_Y_RAD;
  const initialCam = computeInitialCamera({ fovYRad });

  // `InitialCam` is exactly an `OrbitCameraInit` minus `aspect` (reset uses the
  // live canvas ratio, not a captured one), so the camera is the framing
  // snapshot plus the current aspect.
  const cam = createOrbitCamera({ ...initialCam, aspect: canvas.width / canvas.height });
  state.cam = cam;

  // ── Bootstrap seed ───────────────────────────────────────────────────────
  //
  // Fill the cameraRuntime Resources with real values now that the initial
  // OrbitCamera exists. Without this seed the first resting frame would return
  // the placeholder `base` (yaw 0, distance 0.43) rather than the computed
  // framing pose, causing a visible camera jump on the first frame.
  //
  // Three writes, in dependency order:
  //   1. `projection` — read off the assembled camera via `projectionOf`.
  //      Subsequent resizes patch only `aspect`.
  //   2. `lastPose.current` — the initial pose so the first commit-on-edge has
  //      a valid previous pose to refer to.
  //   3. `commitCameraPose` dispatch — makes `camera.base` in the Redux store
  //      authoritative before the first produced frame, so the `resting` driver
  //      returns the correct pose and the first frame does not jump.
  state.cameraRuntime.projection = projectionOf(cam);
  state.cameraRuntime.lastPose.current = poseOf(cam);
  store.dispatch(commitCameraPose(poseOf(cam)));

  // ── Pointer / keyboard / resize listeners ────────────────────────────
  //
  // Centralised in `inputBindings.ts` so every DOM listener the
  // engine cares about lives in one module.  Each callback below
  // is the *semantic* engine action — the inputBindings module
  // already converts `e.clientX/Y` to a CSS-pixel record and owns
  // the requestRender wake for channel-uncovered events (see its
  // module header for the contract).  pointermove is wake-free: the
  // hoverPickDriver owns the async pick path and dispatches to the
  // store; no render frame is required for hover.
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    // Scheduler by reference — created eagerly in the state literal (the
    // forward-declared `frame` binding handles the construction-vs-body
    // chicken-and-egg).
    scheduler: state.subsystems.scheduler,
    // Delegate to the hoverPickDriver, which coalesces moves and fires an
    // async GPU pick. The driver dispatches the hover SelectionRef to the
    // store; React reads it via selectors. No requestRender needed.
    onPointerMove: (cssPx) => {
      hoverPickDriver.onPointerMove(cssPx);
    },
    // Pointer left the canvas → clear hover state.  If a point
    // is selected the card stays visible (showing the pinned
    // point) — selection state is unaffected.
    onPointerLeave: () => {
      store.dispatch(updateSelectionHover(null));
    },
    // Clear hover on pointerdown so the card immediately reflects "nothing
    // hovered" instead of lagging until the drag ends. Cancelling an in-flight
    // tween on a grab is owned by `onGestureStart` (it dispatches
    // `cancelCameraTween()` when a drag actually begins).
    onPointerDown: () => {
      state.picking.pointerDown = true;
      store.dispatch(updateSelectionHover(null));
    },
    onPointerUp: () => {
      state.picking.pointerDown = false;
    },
    // Esc is an explicit dismiss: clear BOTH the select and focus ref slots
    // (close the card, collapse the cluster-focus fade). `clearSelection`
    // targets select + focus only — hover is not cleared, which is correct
    // since the pointer hasn't moved. Self-contained at the engine level so
    // it doesn't depend on the React Esc path — App.tsx also forwards Esc
    // through the handle's `clearSelection()`, which dispatches the same
    // action; the reducer dedupes, so a double-fire is a no-op.
    onEscape: () => {
      store.dispatch(clearSelection());
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

    // Snapshot what's pickable — visible galaxy catalogs (filtered by the
    // pick mask; a fading-out layer clears its bit immediately so it
    // can't claim a click while still visually fading) plus whether any
    // cluster ring is on screen.  Shared with the hover + pick-debug
    // gates via collectPickTargets so all three agree.  The pick mask is
    // DERIVED FRESH here at click time — strictly fresher than the
    // per-frame value `runFrame` computes, so a same-tick toggle is
    // already reflected.
    const { visibleSources, hasAny } = collectPickTargets(
      r,
      deriveSourceMasks(state).pick,
      state.gpu.structureMarkerRenderer,
      milkyWayPickVisible(state, canvas.height),
    );
    if (!hasAny) return null;

    // No frame rendered yet — no camera state to reproduce in the pick
    // pass.  Resolves to null (background), matching pre-first-frame
    // click behaviour.
    const uniformBytes = state.picking.lastFrameUniformBytes;
    if (uniformBytes === null) return null;

    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
      viewportPx: [canvas.width, canvas.height],
      visibleSources,
      // Threaded through so the pick pass can boost its floor size
      // for easier click targets — see PICK_PADDING_PX in pickRenderer.ts.
      pointSizePx: state.settings.galaxyCatalogs.sizePx,
      // Packed uniform bytes from the last visual frame.  The pick
      // renderer uploads them to its OWN buffer and applies its three
      // overrides — the visual buffer is never touched.
      uniformBytes,
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
    // Wake the render loop after any camera mutation so the frame body
    // re-derives the pose, updates the scale bar, and runs the pick gate.
    onChange: () => {
      state.subsystems.scheduler.requestRender();
    },

    // Discrete wheel zoom (no gesture in progress): the resting driver renders
    // the store `base`, so commit the zoomed distance straight into it. Reading
    // `base` from the store (not the frame-lagged `lastPose` Resource) makes
    // rapid wheel ticks accumulate correctly — each tick zooms from the prior
    // tick's committed distance. `clampDistance` enforces the same zoom envelope
    // as the drag/pinch path.
    onZoom: (factor) => {
      store.dispatch(commitCameraPose(zoomedPose(store.getState().camera.base, factor)));
      state.subsystems.scheduler.requestRender();
    },

    // Gesture start: seed the drag register from the live produced pose (NOT
    // from store.camera.base, which is stale mid-tween), begin the Redux drag,
    // and cancel any in-flight tween. Seeding from `lastPose.current` makes
    // both at-rest grabs (lastPose == base) and mid-tween grabs jump-free —
    // the drag register continues from exactly where the animation left the
    // camera. `cancelCameraTween()` is the single cancel-on-grab path: a manual
    // orbit always wins over a focus tween.
    onGestureStart: () => {
      if (state.cam) seedCameraFromBase(state.cam, state.cameraRuntime.lastPose.current);
      store.dispatch(beginDrag());
      store.dispatch(cancelCameraTween());
    },

    // Gesture end: commit the final drag pose into Redux base BEFORE ending
    // the drag, so the committed base is in place the moment the orbitDrag
    // driver deactivates on the next frame. Without this ordering, the next
    // frame's resting driver would return the pre-gesture base, causing a
    // one-frame snap-back to the old position.
    onGestureEnd: () => {
      if (state.cam) store.dispatch(commitCameraPose(poseOf(state.cam)));
      store.dispatch(endDrag());
    },

    onClick: (xCss, yCss) => {
      // Run a one-shot pick at the click position.  We don't use
      // the throttle guard here — clicks are infrequent and we
      // want an immediate, synchronous-feeling response.
      const pick = runPickAtCss(xCss, yCss);
      if (!pick) return;
      // Single-click dispatches the identity ref (null clears). The
      // reconciler saga watches the slot and fills `selectionRows`.
      pick.then((ref) => {
        store.dispatch(updateSelectionSelect(ref));
      });
    },
    onDoubleClick: () => {
      // Upgrade the current select ref to focus. The preceding single-click
      // already wrote the ref to the store, so we read it back from the
      // authoritative slot rather than running a second pick (racing
      // readbacks resolve out of order). A null select ref means empty space:
      // dispatch focus(null) to lift the cluster-focus fade. The camera tween
      // is triggered by the watchFocusTweenSaga — not here.
      const ref = selectSelectedRef(store.getState());
      store.dispatch(updateSelectionFocus(ref));
    },
  });
}
