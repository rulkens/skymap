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
 *   - `state.gpu.pickRenderer`, `state.gpu.pickProgram`.
 *   - `state.subsystems.clickResolver`, `state.subsystems.inputBindings`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.detachControlsRef.current` — written with the
 *     orbit-controls detach function.
 */

import { createOrbitCamera } from '../../../utils/camera/createOrbitCamera';
import { attachOrbitControls } from '../../camera/orbitControls';
import { applyWheelZoom } from '../camera/applyWheelZoom';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { seedCameraFromBase } from '../../camera/seedCameraFromBase';
import { createPickRenderer } from '../../gpu/renderers/galaxyCatalog/pickRenderer';
import { createPickProgram } from '../frame/pickProgram';
import { SLAB_REVERSED_Z, COSMO } from '../frame/slabs';
import { CONTENT_LAYERS } from '../frame/passes';
import { createClickResolver } from '../interaction/clickHandler';
import { createHoverPickDriver } from '../interaction/hoverPickDriver';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera, DEFAULT_FOV_Y_RAD } from '../camera/cameraFraming';
import { poseOf } from '../camera/poseOf';
import { projectionOf } from '../camera/projectionOf';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { EARTH_REF } from '../../../data/selection/earthRef';
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
import {
  selectSelectedRef,
  selectFocusRow,
  selectHasSelectionIntent,
} from '../../../state/selection/selectors';
import { selectOrientation } from '../../../state/settings/selectors';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { isCinemaMode } from '../../../utils/url/isCinemaMode';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 3: pick renderer + camera + orbit controls + click
 * handlers + input bindings + status-ready + settings seed.
 */
export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  // The visual renderer must exist before we wire picking + the camera —
  // `renderer` is the null-guard subject on the next line.
  const renderer = state.gpu.galaxyPointRenderer;
  if (!renderer) return;
  // The point-pick draw provider: it records the galaxy point billboards
  // into the pick pass the pick program owns. The ring / disk / Milky-Way
  // pick draws are their own registry `drawPick` rows now — the picker no
  // longer folds them in, so it takes no marker / disk / MW arguments.
  const pickRenderer = createPickRenderer(
    deps.phaseLocals!.device,
    state.gpu.fadeBgl!,
    state.gpu.sourceBgl!,
    state.gpu.focusBgl!,
    // The live shared focus buffer — so the pick pass excludes non-members
    // of a focused structure from hit-testing (vertex shader culls them).
    state.gpu.focusUniform!.bindGroup,
    SLAB_REVERSED_Z[COSMO]!,
  );
  state.gpu.pickRenderer = pickRenderer;

  // The parallel per-slab pick program over the content-layer registry — the
  // single owner of the hover / click / debug-overlay pick path. It filters
  // `CONTENT_LAYERS` by `drawPick` + `enabled`, re-rasterises each pickable
  // slab into its own r32uint target, reads back the cursor texel, and folds
  // the results near→far. It derives the pick-time camera, the pickable
  // sources, the point size, and the timing slot internally from `state`, so
  // its callers only supply the cursor position.
  const pickProgram = createPickProgram({
    device: deps.phaseLocals!.device,
    canvas,
    state,
    layers: CONTENT_LAYERS,
  });
  state.gpu.pickProgram = pickProgram;

  // ── Hover-pick driver ────────────────────────────────────────────────
  //
  // `hoverPickDriver` owns the full async hover-pick path, decoupled from
  // the render frame. A pointer move feeds `onPointerMove`; the driver
  // coalesces moves (GPU readback latency is the natural throttle),
  // fires an async pick, and dispatches the hover result to the Redux store.
  // Because hover feeds only the React InfoCard text — not a visual halo —
  // no `requestRender` is ever needed here. The driver hands the program a
  // texture-space cursor position and nothing else; the program derives every
  // other pick input live from `state`.
  const store = deps.cb.store;
  const hoverPickDriver = createHoverPickDriver({
    state,
    pickProgram,
    store,
    resolveDeps: { structures: state.data.structures },
  });

  // The resolver runs the whole pixel → SelectionRef boundary via
  // `resolvePick`: it decodes the pick and emits an identity ref. Galaxy
  // identity is purely positional (no cloud read at pick time); the
  // reconciler resolves the cloud at display time. Structure hits resolve
  // the pick index to the record's durable id via the structure store.
  state.subsystems.clickResolver = createClickResolver({
    pickProgram,
    structures: state.data.structures,
  });

  // ── Camera auto-framing ──────────────────────────────────────────────
  //
  // Boot straight into the Earth home pose — see `cameraFraming.ts`. The pose
  // is a pure function of the boot sim instant (the ephemeris is analytic), so
  // the camera is still built before any galaxy catalog has arrived.
  //
  // `simDays` is the live wall-clock instant `startLoop`'s `goLive` re-anchors
  // the sim clock to a moment later (`unixMsToJulianDays(Date.now())`). Reading
  // the same source here — rather than `deriveSimDays(state.time, …)`, which
  // would run against the still-placeholder J2000 anchor at this phase — frames
  // Earth where it will actually sit the instant the loop goes live, so there
  // is no jump on the first follow frame.
  const fovYRad = DEFAULT_FOV_Y_RAD;
  const simDays = unixMsToJulianDays(Date.now());
  // The committed orientation basis the boot pose encodes through, so first-paint
  // yaw/pitch round-trip under the same frame the render path decodes with. A
  // `#orientation=<frame>` deep link is already committed by this async phase (see
  // the boot-ordering note below), so this reads the URL frame when present.
  const frameBasis = ORIENTATION_FRAMES[selectOrientation(store.getState())];
  const initialCam = computeInitialCamera({ fovYRad, simDays, frameBasis });

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
  // Boot ordering vs the URL orientation frame: `watchHashSaga` holds both halves
  // of the hash bridge on `sagaContextRegistered`, and `createEngine` dispatches
  // that (via `setSagaContext`) SYNCHRONOUSLY, before it kicks off the async
  // bootstrap IIFE this phase runs inside. So the read's `#orientation=<frame>`
  // `setOrientation` is committed before this `commitCameraPose` and before the
  // first produced frame — `runFrame` resolves B(t) from `settings.orientation`,
  // so the first paint is framed in the URL's frame with no roll (the read snaps
  // via `setOrientation`, never `requestOrientationChange`, so the frame-roll
  // saga never fires on arrival). The load-bearing gap is registration-before-
  // bootstrap, not construction-before-bootstrap: moving `setSagaContext` into a
  // bootstrap phase, or making bootstrap synchronous with engine construction,
  // would silently regress the boot frame to the default orientation.
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

  // ── Home selection seed ──────────────────────────────────────────────────
  //
  // Boot IS the home state: pose alone would drift. The sim clock boots live
  // (`startLoop`'s `goLive`), so Earth moves from the first frame — a bare pose
  // would let the globe slide out of frame. Seeding focus makes the follow-pivot
  // driver track Earth's live position; seeding select pins the Earth InfoCard,
  // which doubles as the "you are here" onboarding card.
  //
  // No tween is planted: `watchFocusTweenSaga` no-ops for follow-driver bodies,
  // so this focus write never competes with a camera animation.
  //
  // The seed only fires when there is no selection INTENT at all — resolved or
  // still in flight. This phase runs asynchronously after the store is built, and
  // a URL-hash focus with a statically-resolvable id (`body-*`, milkyWay,
  // structures) lands in the store during `watchHashReadSaga`'s arrival read —
  // before this line runs. An unconditional seed would clobber that deep link,
  // and `watchHashWriteSaga` would then publish the seeded state — which composes
  // no `focus` param at all, Earth being the omitted home target — stripping the
  // link off the address bar.
  //
  // A ref-only guard (`selectSelectedRef`/`selectFocusRef` both null) is not
  // enough: a galaxy/star id defers until its catalog pulse lands
  // (`resolveFocusRefDeferring` parks it), so the resolved ref slot reads null
  // for the whole boot window while `selection.pending.focus` already holds
  // the requested id. That window is exactly where this phase runs, so a
  // ref-only guard sees "empty" and seeds Earth over a deep link that is
  // simply still resolving — `resolveRef` then clears the pending id
  // unconditionally, destroying the in-flight request along with the seed.
  // `selectHasSelectionIntent` reads the pending slots too, so a parked
  // request counts as non-empty and the seed defers to it.
  //
  // Accepted consequence: a junk `#focus=zzz` that never resolves parks
  // forever, which permanently suppresses the Earth seed for that session.
  // That is inherent to honouring intent over resolved state — the seed
  // cannot tell "still resolving" from "never will" — and a junk deep link is
  // already a broken URL.
  const rootState = store.getState();
  if (!selectHasSelectionIntent(rootState)) {
    // Cinema seeds FOCUS only. `select` is what draws the selection ring
    // (near0SelectionRingLayer reads selectionRows.select), and it earns its
    // place by explaining the info card — which cinema mode hides. Seeded in
    // cinema it would instead sit around Earth in every recorded frame of
    // every take that opens at home. Focus still has to be seeded, or the
    // camera loses its home target.
    if (!isCinemaMode()) store.dispatch(updateSelectionSelect(EARTH_REF));
    store.dispatch(updateSelectionFocus(EARTH_REF));
  }

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
    const cr = state.subsystems.clickResolver;
    if (!cr) return null;

    // The pick program owns every other decision — the pick-time camera,
    // which layers are pickable, the timing slot. It resolves to null for a
    // not-ready engine or an empty scene, so no pre-pick readiness / target
    // gate is needed here. A zero-catalog scene with visible rings is now
    // clickable (matching the hover path, which never had that gate); an
    // all-hidden scene resolves to null and clears any stale selection.
    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
    });
  };

  deps.detachControlsRef.current = attachOrbitControls(canvas, cam, {
    // Wake the render loop after any camera mutation so the frame body
    // re-derives the pose, updates the scale bar, and runs the pick gate.
    onChange: () => {
      state.subsystems.scheduler.requestRender();
    },

    // The zoom floor's input, read live off the resolved focus row — same
    // derivation the `onZoom` path below uses.
    pivotRadiusMpc: () => pivotRadiusMpc(selectFocusRow(store.getState())),

    // Discrete wheel zoom (no gesture in progress). The zoom goes to whichever
    // driver owns the distance this frame: while a body is followed the
    // followBody driver owns it (scale its distance target in place, so the
    // zoom is not swallowed by the re-asserted framing distance); under an
    // active auto-rotate the committed base folds in the accumulated spin so the
    // elapsed reset is seamless; at rest the resting driver renders `base`, so
    // commit the zoomed base. Reading `base` from the store (not the
    // frame-lagged `lastPose` Resource) makes rapid wheel ticks accumulate
    // correctly — each tick zooms from the prior tick's committed distance.
    // `autoRotate` + `performance.now()` feed the auto-rotate branch's spin
    // fold. See `applyWheelZoom` for the ownership split.
    onZoom: (factor) => {
      const root = store.getState();
      const cam = root.camera;
      const zoomed = applyWheelZoom(
        state.cameraRuntime.clock,
        state.cameraRuntime.prevActiveId.current,
        cam.base,
        factor,
        cam.autoRotate,
        performance.now(),
        // Floors the zoom just off a focused body's surface for every arm of
        // applyWheelZoom, not only the follow driver.
        pivotRadiusMpc(selectFocusRow(root)),
      );
      if (zoomed !== null) store.dispatch(commitCameraPose(zoomed));
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
      pick
        .then((ref) => {
          store.dispatch(updateSelectionSelect(ref));
        })
        .catch(() => {
          // A failed pick readback should not crash input handling; the
          // click is simply dropped and the prior selection stands.
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
