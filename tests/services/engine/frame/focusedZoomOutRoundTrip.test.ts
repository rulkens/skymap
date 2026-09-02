/**
 * focusedZoomOutRoundTrip — the round-5 regression, as a wall-clock-faithful
 * `runFrame` loop (real drivers, follow ease, fold, drain; GPU mocked at the
 * ready gate): Earth focused, zoom IN through engage, zoom OUT to deep space
 * at the fast cadence that froze 14.85° of scene roll (`−0.2592` rad measured
 * at the pre-fix HEAD). The engaged settle's band-blended reference must hand
 * the fold a scene-aligned screen-up at disengage, so the far-field roll
 * returns to the configured scene up.
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

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const EARTH = deriveBodyStates(SIM).get('earth')! as BodyState;
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

/** 16 ms frames from 0..endT, wheel notches injected at their timestamps. */
function runLoop(
  state: EngineState,
  deps: RunFrameDeps,
  events: readonly { t: number; deltaY: number }[],
  endT: number,
): { hr: number; roll: number; arm: string } {
  let evIdx = 0;
  for (let t = 0; t <= endT; t += 16) {
    while (evIdx < events.length && events[evIdx]!.t <= t) {
      (state.subsystems.inputAggregator as { push: (x: unknown) => void }).push({
        kind: 'wheel',
        deltaY: events[evIdx]!.deltaY,
        duringGesture: false,
        xPx: 50,
        yPx: 50,
      });
      evIdx += 1;
    }
    runFrame(state, deps, t);
  }
  const live = liveWorldPose(state);
  const eye = eyeMpcOf(live, B);
  const d = Math.hypot(
    eye[0]! - EARTH.positionMpc[0]!,
    eye[1]! - EARTH.positionMpc[1]!,
    eye[2]! - EARTH.positionMpc[2]!,
  );
  return {
    hr: d / R_MPC - 1,
    roll: live.roll ?? 0,
    arm: state.cameraRuntime.lastPose.current.frame === 'absolute' ? 'abs' : 'body',
  };
}

describe('focused zoom-out round trip (round 5)', () => {
  it('engage → surface → recede → disengage lands the scene roll at ~0 (fast 33 ms)', () => {
    const { state, deps } = makeHarness();
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000; // the follow approach settles at the framing distance first
    for (let i = 0; i < 20; i += 1, t += 33) events.push({ t, deltaY: -100 }); // in, engages
    t += 500;
    for (let i = 0; i < 30; i += 1, t += 33) events.push({ t, deltaY: 100 }); // out, disengages
    const end = runLoop(state, deps, events, t + 1000);

    expect(end.arm).toBe('abs');
    expect(end.hr).toBeGreaterThan(4); // genuinely out of the band
    // Pre-fix HEAD measured −0.2592 rad frozen here (the 14.85° bake).
    expect(Math.abs(end.roll)).toBeLessThan(1e-4);
  });

  it('the never-engaged control keeps the world-arm ride exact (S2)', () => {
    const { state, deps } = makeHarness();
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000;
    for (let i = 0; i < 4; i += 1, t += 33) events.push({ t, deltaY: -100 }); // stays above engage
    t += 500;
    for (let i = 0; i < 25; i += 1, t += 33) events.push({ t, deltaY: 100 });
    const end = runLoop(state, deps, events, t + 1000);

    expect(end.arm).toBe('abs');
    // ~2.5e-5 rad (0.0014°): the world ride's own decay tail — the round-5
    // probe's "0.0" was this value at 4-decimal display precision.
    expect(Math.abs(end.roll)).toBeLessThan(1e-4);
  });
});
