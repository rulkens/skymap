/**
 * wireInput — bootstrap phase that wires the pick renderer, the pick driver,
 * the orbit camera, and the input-bindings listener bag.
 *
 * Runs without waiting on any galaxy catalog load: the camera framing is pure
 * constants from `cameraFraming.ts`, so the loop can come up immediately.
 */

import { attachOrbitControls } from '../../camera/orbitControls';
import { constructGpuHandles } from '../gpuHandles/constructGpuHandles';
import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';
import { createPickDriver } from '../interaction/createPickDriver';
import { attachEngineInputs } from '../interaction/inputBindings';
import { DEFAULT_FOV_Y_RAD, NEAR_CLIP_MPC, FAR_CLIP_MPC } from '../camera/cameraFraming';
import { homePose } from '../camera/homePose';
import { seedCameraRuntime } from '../camera/seedCameraRuntime';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { commitCameraPose, beginDrag, cancelCameraTween } from '../../../state/camera/cameraSlice';
import { updateSelectionHover, clearSelection } from '../../../state/selection/selectionSlice';
import { focusSelected } from '../../../state/selection/focusSelected';
import { selectOrientation } from '../../../state/settings/selectors';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

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

  const store = deps.cb.store;
  state.subsystems.pickDriver = createPickDriver({
    store,
    pickProgram,
    resolvePick: deps.selection.resolvePick,
    canvas,
    state,
    scheduler: state.subsystems.scheduler,
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
    onPointerMove: () => {},
    onPointerLeave: () => {
      store.dispatch(updateSelectionHover(null));
    },
    // Clear hover on pointerdown so the card reflects "nothing hovered"
    // immediately instead of lagging until the drag ends.
    onPointerDown: () => {
      store.dispatch(updateSelectionHover(null));
    },
    onPointerUp: () => {},
    // App.tsx forwards Esc through the handle's `clearSelection()` too; the
    // reducer dedupes, so the double-fire is a no-op.
    onEscape: () => {
      store.dispatch(clearSelection());
    },
    // A no-op: `inputBindings` already wakes the loop, and the next frame's
    // `resizeCanvasToDisplay` picks up the new dimensions.
    onResize: () => {},
  });

  // The recognizer only emits, so waking the loop is this sink's job. The two gesture-start
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
      state.subsystems.scheduler.requestRender();
    },
    {
      // Taps reach the pick driver through the `input` slice once a source feeds it.
      onClick: () => {},
      onDoubleClick: () => {
        // Focuses the ref the preceding single-click selected rather than
        // running a second pick — racing readbacks resolve out of order.
        store.dispatch(focusSelected());
      },
    },
  );
}
