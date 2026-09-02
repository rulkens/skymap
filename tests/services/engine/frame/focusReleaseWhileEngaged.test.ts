/**
 * focusReleaseWhileEngaged — round-10 regression: engaged on Earth, a search
 * focus on Mars must release the camera THROUGH the fold (the single regime
 * author) — conversion + commit-on-edge untouched, followBody active next
 * frame — instead of doing nothing until a manual zoom-out past disengage.
 * Also pins the low-altitude conversion (finite, eye-preserving, targeted at
 * the RELEASED body's centre) and the no-flap property: the engage test may
 * not re-capture the eye while the differing focus holds.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { runFrame } from '../../../../src/services/engine/frame/runFrame';
import { buildCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { createSurfaceController } from '../../../../src/services/camera/surfaceController';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { rootReducer } from '../../../../src/store/rootReducer';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../../src/state/time/timeSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const BODIES = deriveBodyStates(SIM);
const EARTH = BODIES.get('earth')! as BodyState;
const MARS = BODIES.get('mars')! as BodyState;
const R_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;

function poseAtHR(hr: number, roll: number): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: R_MPC * (1 + hr),
    roll,
  };
}

function makeHarness() {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setSimDays({ simDays: SIM, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));
  const state = {
    settings: { camera: { fovDeg: 60 }, orientation: DEFAULT_ORIENTATION },
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
      fovYRad: 0.8,
      aspect: 1,
      near: 0.01,
      far: 1000,
    } as unknown as OrbitCamera,
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad: 0.8, aspect: 1, near: 0.01, far: 50000 },
      lastPose: { current: absoluteArm(poseAtHR(10, 0)) },
      prevActiveId: { current: 'resting' },
      lastRenderedSimDays: { current: SIM },
      upBasis: { current: [...B] },
      surface: createSurfaceController(),
      lastZoomFactor: { current: null },
    },
  } as unknown as EngineState;
  const deps = {
    canvas: { width: 100, height: 100, clientWidth: 100, clientHeight: 100 },
    cb: { store },
    device: {},
    context: {},
    timingService: {},
    drivers: buildCameraDrivers(state),
  } as unknown as RunFrameDeps;
  store.dispatch(commitCameraPose(absoluteArm(poseAtHR(10, 0))));
  store.dispatch(
    setSelectionRow({
      slot: 'focus',
      row: {
        type: 'body',
        id: 'earth',
        label: 'Earth',
        positionMpc: [0, 0, 0],
        radiusM: SCENE_EARTH.radiusM,
      },
    }),
  );
  return { store, state, deps };
}

function distTo(eye: Readonly<Vec3>, body: BodyState): number {
  return Math.hypot(
    eye[0]! - body.positionMpc[0]!,
    eye[1]! - body.positionMpc[1]!,
    eye[2]! - body.positionMpc[2]!,
  );
}

describe('focus release while engaged (round 10)', () => {
  it('focusing Mars from an engaged Earth camera releases, converts sanely, and follows', () => {
    const { store, state, deps } = makeHarness();

    // Dive through engage to h/R ≈ 1.1 (the brief's low-altitude case).
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000;
    for (let i = 0; i < 12; i += 1, t += 33) events.push({ t, deltaY: -100 });
    let evIdx = 0;
    let now = 0;
    for (; now <= t + 500; now += 16) {
      while (evIdx < events.length && events[evIdx]!.t <= now) {
        (state.subsystems.inputAggregator as { push: (x: unknown) => void }).push({
          kind: 'wheel',
          deltaY: events[evIdx]!.deltaY,
          duringGesture: false,
          xPx: 50,
          yPx: 50,
        });
        evIdx += 1;
      }
      runFrame(state, deps, now);
    }
    expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute'); // engaged
    const eyeBefore = eyeMpcOf(liveWorldPose(state), B);
    const marsBefore = distTo(eyeBefore, MARS);

    // The user's action: search-focus Mars. Without the fix nothing happens
    // until a manual zoom-out past disengage.
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'mars',
          label: 'Mars',
          positionMpc: [MARS.positionMpc[0]!, MARS.positionMpc[1]!, MARS.positionMpc[2]!],
          radiusM: 3390000,
        },
      }),
    );
    runFrame(state, deps, (now += 16));

    // Release frame: the fold flipped the regime through its own conversion +
    // commit site — target at the RELEASED body's centre, eye preserved,
    // everything finite at h/R ≈ 1.1.
    const base = store.getState().camera.base;
    expect(base.frame).toBe('absolute');
    expect(base.frame === 'absolute' && base.pose).toBeTruthy();
    const released = base.pose as CameraPose;
    for (const v of [
      released.target[0]!,
      released.target[1]!,
      released.target[2]!,
      released.yaw,
      released.pitch,
      released.distance,
      released.roll ?? 0,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(released.target[0]).toBeCloseTo(EARTH.positionMpc[0]!, 12);
    expect(released.target[1]).toBeCloseTo(EARTH.positionMpc[1]!, 12);
    expect(released.target[2]).toBeCloseTo(EARTH.positionMpc[2]!, 12);
    expect(released.distance / R_MPC).toBeGreaterThan(1.9); // ≈ 1 + h/R, eye preserved
    expect(released.distance / R_MPC).toBeLessThan(2.4);

    // Follow-through: the arm stays absolute EVERY frame (no engage/release
    // flap while the eye is still inside Earth's engage range), followBody
    // takes the frame, and the camera actually travels to Mars.
    for (let i = 0; i < 150; i += 1) {
      runFrame(state, deps, (now += 16));
      expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
    }
    expect(state.cameraRuntime.prevActiveId.current).toBe('followBody');
    const eyeAfter = eyeMpcOf(liveWorldPose(state), B);
    expect(distTo(eyeAfter, MARS)).toBeLessThan(marsBefore * 1e-2);
  });
});
