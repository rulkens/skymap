/**
 * makeCameraSimHarness — the shared runFrame-sim fixture: one Redux store,
 * one EngineState (gpu stubbed so `deriveFrameContext`'s ready gate bails
 * right after the fold — the slice every frame-level camera fixture actually
 * exercises), and the RunFrameDeps that make `runFrame` callable. Defaults
 * (Earth focused, h/R 10, 60° FOV, 100×100 canvas) are the intersection of
 * what fixtures need; `CameraSimHarnessOptions` documents per-field override
 * semantics.
 */

import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { composeControlSchemes } from '../../../src/services/engine/camera/composeControlSchemes';
import { APP_EXHIBITS } from '../../../src/compositions/appExhibits';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from '../../../src/services/engine/camera/cameraFraming';
import { seedCameraRuntime } from '../../../src/services/engine/camera/seedCameraRuntime';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { runFrame } from '../../../src/services/engine/frame/runFrame';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import {
  inputSourceAttached,
  inputGestureStarted,
  inputMoved,
  inputGestureEnded,
} from '../../../src/state/input/inputSlice';
import { WHEEL_ZOOM_K } from '../../../src/data/input/wheelZoomK';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { bodyDriverGeometry } from '../../../src/utils/scene/bodyDriverGeometry';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { deepFreeze } from '../deepFreeze';
import { makeCubemapCaptureRuntimes } from '../engine/makeCubemapCaptureRuntimes';
import { poseAtHR } from './poseAtHR';
import type { SimBodyId } from './SimBodyId';
import type { CameraSimHarnessOptions } from './CameraSimHarnessOptions';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraEpochs } from '../../../src/@types/engine/camera/CameraEpochs';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { HeldIntent } from '../../../src/@types/input/HeldIntent';
import type { UnitPoint } from '../../../src/@types/input/UnitPoint';
import type { RunFrameDeps } from '../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec2 } from '../../../src/@types/math/Vec2';

export function makeCameraSimHarness(options: CameraSimHarnessOptions = {}) {
  const {
    fovDeg = 60,
    canvasSize = 100,
    focusBody = 'earth',
    bootHR = 10,
    neutralDistance = 100,
    realClipPlayer = false,
  } = options;
  const fovYRad = (fovDeg * Math.PI) / 180;

  const neutralPose: CameraPose = {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: neutralDistance,
  };

  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setSimDays({ simDays: CONST_J2000, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));
  // Dispatched before the seed below, matching production's boot order —
  // `seedCameraRuntime` copies `base`, so the runtime's first frame reads
  // this commit as an outside one (see its header).
  store.dispatch(commitCameraPose(absoluteArm(neutralPose)));

  const bodies: ReadonlyMap<string, BodyState> = deriveBodyStates(CONST_J2000);
  const radiusM = (id: SimBodyId): number =>
    SCENE_CELESTIAL_BODIES.find((b) => b.id === id)!.surface.datumRadiusM;

  const state = {
    settings: { camera: { fovDeg }, orientation: DEFAULT_ORIENTATION },
    gpu: { galaxyPointRenderer: null, renderTargets: null },
    subsystems: {
      scheduler: { requestRender: () => {}, requestIdleFrame: () => {} },
      clipPlayer: { tick: (clipEpoch: CameraEpochs['clip']) => ({ clipEpoch }) },
    },
    booted: true,
    layers: [],
    cameraRuntime: seedCameraRuntime({
      state: store.getState(),
      projection: { fovYRad, aspect: 1, near: NEAR_CLIP_MPC, far: FAR_CLIP_MPC },
    }),
    cubemapCaptures: makeCubemapCaptureRuntimes(),
    // Live off the store, same as `engine.ts`'s own getter: `runFrame` reads
    // this post-dispatch, so a fixed snapshot would go stale the instant a
    // test dispatches a focus change.
    get selectionRows() {
      return store.getState().selectionRows;
    },
  } as unknown as EngineState;
  if (realClipPlayer) {
    state.subsystems.clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
      getEngineState: () => state,
    });
  }

  const deps = {
    canvas: {
      width: canvasSize,
      height: canvasSize,
      clientWidth: canvasSize,
      clientHeight: canvasSize,
    },
    cb: { store },
    device: {},
    context: {},
    timingService: {},
    controlSchemes: composeControlSchemes(Object.values(APP_EXHIBITS)),
  } as unknown as RunFrameDeps;

  /** Commit `framed` to the store and re-seed the runtime from it. */
  const seedPose = (framed: FramedCameraPose): void => {
    store.dispatch(commitCameraPose(framed));
    state.cameraRuntime = seedCameraRuntime({
      state: store.getState(),
      projection: state.cameraRuntime.outputs.projection,
    });
    deepFreeze(state.cameraRuntime);
  };

  /** Dispatch a focus row for `id` off its real seeded position, or clear it. */
  const focus = (id: SimBodyId | null): void => {
    if (id === null) {
      store.dispatch(setSelectionRow({ slot: 'focus', row: null }));
      return;
    }
    const body = bodies.get(id)!;
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          positionMpc: [body.positionMpc[0]!, body.positionMpc[1]!, body.positionMpc[2]!],
          driver: bodyDriverGeometry(id),
        },
      }),
    );
  };

  if (bootHR !== null) {
    const bootBody = focusBody ?? 'earth';
    seedPose(absoluteArm(poseAtHR(bodies.get(bootBody)!, radiusM(bootBody), bootHR)));
  }
  if (focusBody !== null) focus(focusBody);

  let now = 0;
  /** Run one frame at an explicit wall-clock ms (for hand-scheduled events). */
  const tick = (nowMs: number): void => {
    runFrame(state, deps, nowMs);
    // The runtime-half of the single-writer gate (see
    // `cameraRuntimeSingleWriter.test.ts`): a between-frames write into last
    // frame's runtime throws here instead of drifting into the next `prev`.
    deepFreeze(state.cameraRuntime);
    now = nowMs;
  };
  /** Advance the internal 16ms clock and run `count` frames. */
  const frame = (count = 1): void => {
    for (let i = 0; i < count; i += 1) tick((now += 16));
  };
  // The canvas as the one input source, square like the canvas. Positions are
  // canvas px, converted to units here as the canvas adapter does; `held`
  // remembers the last point, so each move's delta runs from the one before.
  store.dispatch(inputSourceAttached({ source: 'canvas', aspect: 1 }));
  const unitOf = (px: Readonly<Vec2>): UnitPoint => ({
    x: px[0] / canvasSize,
    y: px[1] / canvasSize,
  });
  let held: { intent: HeldIntent; lastPx: Readonly<Vec2> } | null = null;

  /** Open a gesture at `px` (no frame advance). */
  const press = (intent: HeldIntent, px: Readonly<Vec2>): void => {
    store.dispatch(inputGestureStarted({ source: 'canvas', intent }));
    held = { intent, lastPx: px };
  };
  /** Move the held pointer to `px`; a no-op with no gesture open. */
  const moveTo = (px: Readonly<Vec2>): void => {
    if (held === null) return;
    const dx = (px[0] - held.lastPx[0]) / canvasSize;
    const dy = (px[1] - held.lastPx[1]) / canvasSize;
    const motion = { intent: held.intent, dx, dy, ratio: 1, at: unitOf(px), held: true };
    store.dispatch(inputMoved({ source: 'canvas', motion: [motion] }));
    held.lastPx = px;
  };
  const release = (): void => {
    store.dispatch(inputGestureEnded({ source: 'canvas' }));
    held = null;
  };
  /** One wheel notch at `cursorPx` (no frame advance); held while a gesture is open. */
  const notch = (deltaY: number, cursorPx: Readonly<Vec2> = [50, 50]): void => {
    const ratio = Math.exp(deltaY * WHEEL_ZOOM_K);
    const motion = {
      intent: 'zoom',
      dx: 0,
      dy: 0,
      ratio,
      at: unitOf(cursorPx),
      held: held !== null,
    } as const;
    store.dispatch(inputMoved({ source: 'canvas', motion: [motion] }));
  };
  /** One notch plus two frames, the shape needed to fully fold a notch into the register. */
  const wheel = (deltaY: number, cursorPx: Readonly<Vec2> = [50, 50]): void => {
    notch(deltaY, cursorPx);
    frame(2);
  };

  /** The wall clock of the last frame run — what a hand-built next frame dates itself from. */
  const nowMs = (): number => now;

  return {
    store,
    state,
    deps,
    bodies,
    radiusM,
    seedPose,
    focus,
    tick,
    frame,
    press,
    moveTo,
    release,
    notch,
    wheel,
    nowMs,
  };
}
