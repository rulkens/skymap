/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit camera,
 * click + double-click handlers, and the input-bindings listener bag.
 *
 * Runs without waiting on any galaxy catalog load: the camera framing is pure
 * constants from `cameraFraming.ts`, so the loop can come up immediately.
 */

import { attachOrbitControls } from '../../camera/orbitControls';
import { constructGpuHandles } from '../gpuHandles/constructGpuHandles';
import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';
import { createClickResolver } from '../interaction/clickHandler';
import { createHoverPickDriver } from '../interaction/hoverPickDriver';
import { attachEngineInputs } from '../interaction/inputBindings';
import { DEFAULT_FOV_Y_RAD, NEAR_CLIP_MPC, FAR_CLIP_MPC } from '../camera/cameraFraming';
import { homePose } from '../camera/homePose';
import { seedCameraRuntime } from '../camera/seedCameraRuntime';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { commitCameraPose, beginDrag, cancelCameraTween } from '../../../state/camera/cameraSlice';
import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
  clearSelection,
} from '../../../state/selection/selectionSlice';
import { selectSelectedRef } from '../../../state/selection/selectors';
import { selectOrientation } from '../../../state/settings/selectors';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';

export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;
  const home = deps.composition.home;

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
    get envBrdfLut() {
      return state.gpu.envBrdfLut!;
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
    resolvePick: deps.selection.resolvePick,
  });

  // Galaxy identity is purely positional — no cloud read at pick time; the
  // reconciler resolves the cloud at display time.
  state.subsystems.clickResolver = createClickResolver({
    pickProgram,
    resolvePick: deps.selection.resolvePick,
  });

  // The neutral base the runtime starts from: the composition's home pose at
  // the live wall-clock instant `arrivalSaga`'s `goLive` anchored to. The view
  // itself is `arrivalSaga`'s, which commits over this base in the same
  // dispatch, before any frame draws.
  const simDays = unixMsToJulianDays(Date.now());
  // The URL's orientation is already in the store: `createEngine` dispatches
  // `setSagaContext` SYNCHRONOUSLY, before the async bootstrap this phase
  // runs inside, and `arrivalSaga` lands it on that boot read, before it
  // waits for this runtime. A seed in another frame re-encodes on frame 1.
  const frameBasis = ORIENTATION_FRAMES[selectOrientation(store.getState())];

  state.booted = true;

  // Seeded BEFORE the commit below, off the still-placeholder store — the one
  // exception to `seedCameraRuntime`'s own "dispatch first" contract — so
  // frame one reads the boot pose as an OUTSIDE commit, adopted settled.
  state.cameraRuntime = seedCameraRuntime({
    state: store.getState(),
    projection: {
      fovYRad: DEFAULT_FOV_Y_RAD,
      aspect: canvas.width / canvas.height,
      near: NEAR_CLIP_MPC,
      far: FAR_CLIP_MPC,
    },
  });
  store.dispatch(commitCameraPose(homePose(home, DEFAULT_FOV_Y_RAD, simDays, frameBasis)));

  // Callbacks are the semantic engine actions: `inputBindings` already converts
  // `e.clientX/Y` to CSS pixels and owns the requestRender wake for
  // channel-uncovered events (see its module header for the contract).
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    scheduler: state.subsystems.scheduler,
    onPointerMove: (cssPx) => {
      hoverPickDriver.onPointerMove(cssPx);
      // The terrain-pick marker is drawn where the cursor is, so it needs a
      // frame to follow it — the one place a pointermove earns the wake this
      // input mouth otherwise refuses (`inputBindings`' contract). Both the
      // write and the wake are gated on the toggle, so hover stays wake-free
      // and this whole debug path is unreachable with the overlay off. Also
      // gated on the rig's `pickable` flag: a dome frame has no single cursor
      // ray, so `terrainPickMarkerPass`'s `cursorTexPx === null` gate must stay
      // satisfied there.
      if (!state.settings.debug.overlays['terrain-pick-marker']) return;
      if (!VIEW_RIGS[state.viewRig].pickable) return;
      state.picking.cursorTexPx = [cssToTexPx(cssPx.x), cssToTexPx(cssPx.y)];
      state.subsystems.scheduler.requestRender();
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

  // The recognizer only emits; `runFrame` replays the queue at the top of
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
