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
import { CAMERA_DRIVERS } from '../../../src/services/engine/camera/cameraDrivers';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from '../../../src/services/engine/camera/cameraFraming';
import { seedCameraRuntime } from '../../../src/services/engine/camera/seedCameraRuntime';
import { createInputAggregator } from '../../../src/services/engine/subsystems/inputAggregator';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { runFrame } from '../../../src/services/engine/frame/runFrame';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { poseAtHR } from './poseAtHR';
import type { SimBodyId } from './SimBodyId';
import type { CameraSimHarnessOptions } from './CameraSimHarnessOptions';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraEpochs } from '../../../src/@types/engine/camera/CameraEpochs';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { InputGestureEvent } from '../../../src/@types/camera/InputGestureEvent';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
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

  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setSimDays({ simDays: CONST_J2000, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));

  const bodies: ReadonlyMap<string, BodyState> = deriveBodyStates(CONST_J2000);
  const radiusM = (id: SimBodyId): number => SCENE_BODIES.find((b) => b.id === id)!.radiusM;

  const neutralPose: CameraPose = {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: neutralDistance,
  };

  const state = {
    settings: { camera: { fovDeg }, orientation: DEFAULT_ORIENTATION },
    gpu: { galaxyPointRenderer: null, renderTargets: null, milkyWayCloud: null },
    subsystems: {
      scheduler: { requestRender: () => {}, requestIdleFrame: () => {} },
      clipPlayer: { tick: (clipEpoch: CameraEpochs['clip']) => ({ clipEpoch }) },
      inputAggregator: createInputAggregator(),
    },
    cam: {
      yaw: 0,
      pitch: 0,
      distance: 1,
      target: new Float32Array(3),
      position: new Float32Array(3),
      fovYRad,
      aspect: 1,
      near: NEAR_CLIP_MPC,
      far: FAR_CLIP_MPC,
    } as unknown as OrbitCamera,
    cameraRuntime: seedCameraRuntime({
      committed: absoluteArm(neutralPose),
      projection: { fovYRad, aspect: 1, near: NEAR_CLIP_MPC, far: FAR_CLIP_MPC },
    }),
    skyCubemapCapture: {
      lastBandActive: false,
      lastGcDistanceMpc: Number.POSITIVE_INFINITY,
      bakedSettings: null,
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
    drivers: CAMERA_DRIVERS,
  } as unknown as RunFrameDeps;

  /** Commit `framed` to the store and re-seed the runtime from it. */
  const seedPose = (framed: FramedCameraPose): void => {
    store.dispatch(commitCameraPose(framed));
    state.cameraRuntime = seedCameraRuntime({
      committed: framed,
      projection: state.cameraRuntime.outputs.projection,
    });
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
          radiusM: radiusM(id),
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
    now = nowMs;
  };
  /** Advance the internal 16ms clock and run `count` frames. */
  const frame = (count = 1): void => {
    for (let i = 0; i < count; i += 1) tick((now += 16));
  };
  /** Push a raw recognizer event onto the aggregator (no frame advance). */
  const push = (event: InputGestureEvent): void => {
    state.subsystems.inputAggregator.push(event);
  };
  /** One wheel notch at `cursorPx`: push + two frames, the shape needed to
   * fully fold a notch into the register. */
  const wheel = (deltaY: number, cursorPx: Vec2 = [50, 50]): void => {
    push({ kind: 'wheel', deltaY, duringGesture: false, xPx: cursorPx[0], yPx: cursorPx[1] });
    frame(2);
  };

  return { store, state, deps, bodies, radiusM, seedPose, focus, tick, frame, push, wheel };
}
