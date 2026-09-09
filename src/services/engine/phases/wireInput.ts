/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit camera,
 * click + double-click handlers, and the input-bindings listener bag.
 *
 * Runs without waiting on any galaxy catalog load: the camera framing is pure
 * constants from `cameraFraming.ts`, so the loop can come up immediately.
 */

import { createOrbitCamera } from '../../../utils/camera/createOrbitCamera';
import { attachOrbitControls } from '../../camera/orbitControls';
import { constructGpuHandles } from '../gpuHandles/constructGpuHandles';
import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';
import { createClickResolver } from '../interaction/clickHandler';
import { createHoverPickDriver } from '../interaction/hoverPickDriver';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera, DEFAULT_FOV_Y_RAD } from '../camera/cameraFraming';
import { poseOf } from '../camera/poseOf';
import { projectionOf } from '../camera/projectionOf';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { EARTH_REF } from '../../../data/selection/earthRef';
import { commitCameraPose, beginDrag, cancelCameraTween } from '../../../state/camera/cameraSlice';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
  clearSelection,
} from '../../../state/selection/selectionSlice';
import { selectSelectedRef, selectHasSelectionIntent } from '../../../state/selection/selectors';
import { selectOrientation } from '../../../state/settings/selectors';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { isCinemaMode } from '../../../utils/url/isCinemaMode';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';

export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  const renderer = state.gpu.galaxyPointRenderer;
  if (!renderer) return;
  // `ctx.format` has no live source at this phase (no row here bakes a
  // swap-format pipeline); it throws rather than silently re-deriving a value
  // that could diverge from `initGpu`'s boot format.
  const handleDeps: GpuHandleConstructDeps = {
    ctx: {
      device: deps.phaseLocals!.device,
      get context() {
        return state.gpu.uiCtx!.context;
      },
      canvas,
      get format(): GPUTextureFormat {
        throw new Error('wireInput-phase rows never read ctx.format — wire a derivation first');
      },
      get hdrCapable() {
        return state.gpu.uiCtx!.hdrCapable;
      },
    },
    fadeBgl: state.gpu.fadeBgl!,
    sourceBgl: state.gpu.sourceBgl!,
    focusBgl: state.gpu.focusBgl!,
    get fontAtlases() {
      return state.gpu.fontAtlases!;
    },
  };
  // Complement of initGpu.ts's filter, by construction: this phase builds
  // only the rows marked `constructPhase: 'wireInput'`.
  constructGpuHandles(
    GPU_HANDLE_ROWS.filter((row: GpuHandleRow) => row.constructPhase === 'wireInput'),
    state,
    handleDeps,
  );
  const pickProgram = state.gpu.pickProgram!;

  // Hover feeds only the React InfoCard text, not a visual halo, so the hover
  // path never needs a `requestRender`; GPU readback latency is its throttle.
  const store = deps.cb.store;
  const hoverPickDriver = createHoverPickDriver({
    state,
    pickProgram,
    store,
    resolveDeps: { structures: state.data.structures },
  });

  // Galaxy identity is purely positional — no cloud read at pick time; the
  // reconciler resolves the cloud at display time.
  state.subsystems.clickResolver = createClickResolver({
    pickProgram,
    structures: state.data.structures,
  });

  const fovYRad = DEFAULT_FOV_Y_RAD;
  // The live wall-clock instant `startLoop`'s `goLive` re-anchors the sim clock
  // to, NOT `deriveSimDays(state.time, …)` — that would run against the still-
  // placeholder J2000 anchor at this phase and frame Earth where it isn't, giving
  // a jump on the first follow frame.
  const simDays = unixMsToJulianDays(Date.now());
  // The committed orientation basis the boot pose encodes through, so first-paint
  // yaw/pitch round-trip under the same frame the render path decodes with.
  const frameBasis = ORIENTATION_FRAMES[selectOrientation(store.getState())];
  const initialCam = computeInitialCamera({ fovYRad, simDays, frameBasis });

  const cam = createOrbitCamera({ ...initialCam, aspect: canvas.width / canvas.height });
  state.cam = cam;

  // Without this seed the first resting frame returns the placeholder `base`
  // (yaw 0, distance 0.43) rather than the computed framing pose — a visible
  // camera jump on frame one.
  //
  // The URL orientation frame is already committed here because `createEngine`
  // dispatches `setSagaContext` SYNCHRONOUSLY, before the async bootstrap IIFE
  // this phase runs inside. Registration-before-bootstrap is the load-bearing
  // gap: moving `setSagaContext` into a bootstrap phase, or making bootstrap
  // synchronous with engine construction, silently regresses the boot frame to
  // the default orientation.
  state.cameraRuntime.projection = projectionOf(cam);
  state.cameraRuntime.lastPose.current = absoluteArm(poseOf(cam));
  // Displayed = authored at boot: nothing has been projected yet.
  state.cameraRuntime.displayedPose.current = state.cameraRuntime.lastPose.current;
  store.dispatch(commitCameraPose(absoluteArm(poseOf(cam))));

  // Boot IS the home state: the sim clock boots live, so Earth moves from the
  // first frame and a bare pose would let the globe slide out of frame.
  //
  // The guard is INTENT, not resolved refs: a galaxy/star id from `#focus=`
  // defers until its catalog pulse lands, so the resolved ref slot reads null
  // for the whole boot window this phase runs in. A ref-only guard would seed
  // Earth over a deep link that is merely still resolving, and `resolveRef`
  // would then clear the pending id along with it. Consequence accepted: a junk
  // `#focus=zzz` parks forever and suppresses the Earth seed for that session.
  const rootState = store.getState();
  if (!selectHasSelectionIntent(rootState)) {
    // Cinema seeds FOCUS only: `select` draws the selection ring, which earns its
    // place by explaining the info card — and cinema mode hides that card, so the
    // ring would just sit around Earth in every recorded frame.
    if (!isCinemaMode()) store.dispatch(updateSelectionSelect(EARTH_REF));
    store.dispatch(updateSelectionFocus(EARTH_REF));
  }

  // Callbacks are the semantic engine actions: `inputBindings` already converts
  // `e.clientX/Y` to CSS pixels and owns the requestRender wake for
  // channel-uncovered events (see its module header for the contract).
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    scheduler: state.subsystems.scheduler,
    onPointerMove: (cssPx) => {
      hoverPickDriver.onPointerMove(cssPx);
    },
    onPointerLeave: () => {
      store.dispatch(updateSelectionHover(null));
    },
    // Clear hover on pointerdown so the card reflects "nothing hovered"
    // immediately instead of lagging until the drag ends.
    onPointerDown: () => {
      state.picking.pointerDown = true;
      store.dispatch(updateSelectionHover(null));
    },
    onPointerUp: () => {
      state.picking.pointerDown = false;
    },
    // App.tsx forwards Esc through the handle's `clearSelection()` too; the
    // reducer dedupes, so the double-fire is a no-op.
    onEscape: () => {
      store.dispatch(clearSelection());
    },
    // A no-op: `inputBindings` already wakes the loop, and the next frame's
    // `resizeCanvasToDisplay` picks up the new dimensions.
    onResize: () => {},
  });

  // `attachOrbitControls` owns click detection: `onClick` fires only when
  // pointerup lands within 4 CSS pixels of pointerdown, so pure orbit drags are
  // suppressed.
  const runPickAtCss = (
    xCss: number,
    yCss: number,
  ): ReturnType<NonNullable<typeof state.subsystems.clickResolver>['resolveClick']> | null => {
    const cr = state.subsystems.clickResolver;
    if (!cr) return null;

    // The pick program resolves to null for a not-ready engine or an empty
    // scene, so no pre-pick readiness gate is needed here.
    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
    });
  };

  // The recognizer only emits; `drainInput` applies the queue at the top of
  // `runFrame`, so waking the loop is this sink's job. The two gesture-start
  // STORE edges fire here at DOM time, not at the drain: `onDoubleClick`
  // dispatches focus synchronously and `watchFocusTweenSaga` reaches
  // `put(startCameraTween)` with no intervening yield, so a `cancelCameraTween`
  // deferred to the next frame would kill the tween double-tap-to-focus just
  // started. `beginDrag` rides along to keep the pair atomic.
  deps.detachControlsRef.current = attachOrbitControls(
    canvas,
    (event) => {
      if (event.kind === 'gestureStart') {
        store.dispatch(beginDrag());
        store.dispatch(cancelCameraTween());
      }
      state.subsystems.inputAggregator.push(event);
      state.subsystems.scheduler.requestRender();
    },
    {
      onClick: (xCss, yCss) => {
        const pick = runPickAtCss(xCss, yCss);
        if (!pick) return;
        pick
          .then((ref) => {
            store.dispatch(updateSelectionSelect(ref));
          })
          .catch(() => {
            // A failed pick readback must not crash input handling; the click is
            // dropped and the prior selection stands.
          });
      },
      onDoubleClick: () => {
        // Read the select ref the preceding single-click wrote rather than
        // running a second pick — racing readbacks resolve out of order.
        const ref = selectSelectedRef(store.getState());
        store.dispatch(updateSelectionFocus(ref));
      },
    },
  );
}
