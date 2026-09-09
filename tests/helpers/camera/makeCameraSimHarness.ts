/**
 * makeCameraSimHarness — the shared runFrame-sim fixture. One Redux store,
 * one EngineState (gpu stubbed so `deriveFrameContext`'s ready gate bails
 * right after the fold — the slice every frame-level camera fixture actually
 * exercises), and the RunFrameDeps that make `runFrame` callable. Every
 * `frame/*`, `camera/commitOnEdge` and `animation/playClipFlyout` fixture
 * rebuilt this bag by hand before this file existed: the union of what they
 * read is this shape, the intersection is these defaults (Earth focused,
 * h/R 10, 60° FOV, 100×100 canvas).
 *
 * `bootHR: null` skips the boot pose/commit entirely (the fixture then seeds
 * its own per test via `seedPose` — the `poseFold`/`commitOnEdge` shape);
 * `focusBody: null` skips the boot focus row (no body engages by altitude
 * alone).
 */

import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { buildCameraDrivers } from '../../../src/services/engine/camera/cameraDrivers';
import { createCameraClock } from '../../../src/services/engine/camera/cameraClock';
import { createInputAggregator } from '../../../src/services/engine/subsystems/inputAggregator';
import { createSurfaceController } from '../../../src/services/camera/surfaceController';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { runFrame } from '../../../src/services/engine/frame/runFrame';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { poseAtHR } from './poseAtHR';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { InputGestureEvent } from '../../../src/@types/camera/InputGestureEvent';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
import type { RunFrameDeps } from '../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec2 } from '../../../src/@types/math/Vec2';

/**
 * The three bodies the migrated fixtures focus or measure against — the
 * `deriveBodyStates` / `SCENE_BODIES` id space (per-body identity), a
 * different, wider domain than `BodyId` (the visibility-toggle id space,
 * where every planet shares the single `'planet'` row).
 */
export type SimBodyId = 'earth' | 'mars' | 'saturn';

export type CameraSimHarnessOptions = {
  readonly fovDeg?: number;
  readonly canvasSize?: number;
  /** Body focused via `setSelectionRow` at boot; `null` skips the dispatch. */
  readonly focusBody?: SimBodyId | null;
  /** h/R over `focusBody` (or Earth) the boot pose starts at; `null` skips
   * seeding a pose — the fixture seeds its own via `seedPose`. */
  readonly bootHR?: number | null;
};

export function makeCameraSimHarness(options: CameraSimHarnessOptions = {}) {
  const { fovDeg = 60, canvasSize = 100, focusBody = 'earth', bootHR = 10 } = options;
  const fovYRad = (fovDeg * Math.PI) / 180;

  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setSimDays({ simDays: CONST_J2000, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));

  const bodies: ReadonlyMap<string, BodyState> = deriveBodyStates(CONST_J2000);
  const radiusM = (id: SimBodyId): number => SCENE_BODIES.find((b) => b.id === id)!.radiusM;

  const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
  const neutralPose: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };

  const state = {
    settings: { camera: { fovDeg }, orientation: DEFAULT_ORIENTATION },
    gpu: { galaxyPointRenderer: null, renderTargets: null, milkyWayCloud: null },
    subsystems: {
      scheduler: { requestRender: () => {}, requestIdleFrame: () => {} },
      clipPlayer: { tick: () => {} },
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
      near: 0.01,
      far: 1000,
    } as unknown as OrbitCamera,
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad, aspect: 1, near: 0.01, far: 50000 },
      lastPose: { current: absoluteArm(neutralPose) },
      displayedPose: { current: absoluteArm(neutralPose) },
      prevActiveId: { current: 'resting' },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: [...B] },
      surface: createSurfaceController(),
      lastZoomFactor: { current: null },
      skyCubemapCapture: {
        bandActive: false,
        gcDistanceMpc: Number.POSITIVE_INFINITY,
        bakedSettings: null,
      },
    },
  } as unknown as EngineState;

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
    drivers: buildCameraDrivers(state),
  } as unknown as RunFrameDeps;

  /** Commit `framed` to the store and seed both pose Resources with it. */
  const seedPose = (framed: FramedCameraPose): void => {
    store.dispatch(commitCameraPose(framed));
    state.cameraRuntime.lastPose.current = framed;
    state.cameraRuntime.displayedPose.current = framed;
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
  /** Advance the internal 16ms clock and run `count` frames (default 1). */
  const frame = (count = 1): void => {
    for (let i = 0; i < count; i += 1) tick((now += 16));
  };
  /** Push a raw recognizer event onto the aggregator (no frame advance). */
  const push = (event: InputGestureEvent): void => {
    state.subsystems.inputAggregator.push(event);
  };
  /** One wheel notch at `cursorPx`: push + two frames — the shape every
   * migrated fixture used to fold a notch fully into the register. */
  const wheel = (deltaY: number, cursorPx: Vec2 = [50, 50]): void => {
    push({ kind: 'wheel', deltaY, duringGesture: false, xPx: cursorPx[0], yPx: cursorPx[1] });
    frame(2);
  };

  return { store, state, deps, bodies, radiusM, seedPose, focus, tick, frame, push, wheel };
}

export type CameraSimHarness = ReturnType<typeof makeCameraSimHarness>;
