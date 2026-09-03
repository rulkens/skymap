/**
 * tiltLerpRoundTrip — ruling 13: display tilt is `remembered × w(h/R)` as a
 * pure function of altitude REGARDLESS of arm and direction. The round-11
 * shape expressed the mapping only on the engaged arm; a focused zoom-out
 * past disengage and back in was world-armed through the whole hysteresis
 * window (pivot-pinned to the body centre, tilt 0), then at the engage
 * notch the remembered tilt returned as a capped 0.1 rad/notch walk — the
 * threshold flip the user saw. Real runFrame loop, real drag/wheel steps.
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
import { beginDrag, commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../../src/state/time/timeSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { mappedTiltRad } from '../../../../src/utils/camera/mappedTiltRad';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

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

type Push = (x: unknown) => void;

/** Display tilt of the RENDERED pose vs Earth: angle(view axis, nadir). */
function displayTilt(state: EngineState): { tilt: number; hr: number } {
  const live = liveWorldPose(state);
  const eye = eyeMpcOf(live, B);
  const rel: Vec3 = [
    eye[0]! - EARTH.positionMpc[0]!,
    eye[1]! - EARTH.positionMpc[1]!,
    eye[2]! - EARTH.positionMpc[2]!,
  ];
  const mag = Math.hypot(...rel);
  const n = normalize3(rel);
  const forward = normalize3([
    live.target[0]! - eye[0]!,
    live.target[1]! - eye[1]!,
    live.target[2]! - eye[2]!,
  ] as Vec3);
  const vert = forward[0]! * n[0]! + forward[1]! * n[1]! + forward[2]! * n[2]!;
  return { tilt: Math.acos(Math.max(-1, Math.min(1, -vert))), hr: mag / R_MPC - 1 };
}

describe('tilt lerp round trip (ruling 13)', () => {
  it('display tilt tracks remembered × w through the window in BOTH directions', () => {
    const { store, state, deps } = makeHarness();
    const push = (state.subsystems.inputAggregator as { push: Push }).push;
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    // Dive to the surface regime.
    for (let i = 0; i < 14; i += 1) {
      push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');

    // Set the memory through the controller's own tilt/look handles. The
    // memory is session state and body-agnostic, so a unit-radius drag is
    // the same write path an engaged Earth drag takes — without hand-tuning
    // a metre-scale gesture through the whole input stack (the drag path
    // itself is pinned in rememberedTilt.test.ts).
    const c = state.cameraRuntime.surface;
    let p: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 2.2],
      basisLocal: [1, 0, 0, 0, 1, 0, 0, 0, -1] as Mat3,
    };
    c.onGestureStart();
    p = c.apply(
      p,
      { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 70] },
      [100, 100],
      Math.PI / 2,
      1,
      [0, 0, 1],
    );
    c.onGestureEnd();
    for (let g = 0; g < 6 && c.rememberedTiltRad() < 0.35; g += 1) {
      c.onGestureStart();
      for (let px = 5; px < 90 && c.rememberedTiltRad() < 0.35; px += 5) {
        p = c.apply(
          p,
          { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + 5] },
          [100, 100],
          Math.PI / 2,
          1,
          [0, 0, 1],
        );
      }
      c.onGestureEnd();
    }

    // Converge the engaged display onto the memory before tracing.
    for (let i = 0; i < 12; i += 1) {
      push({ kind: 'wheel', deltaY: 0.0001, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    const remembered = state.cameraRuntime.surface.rememberedTiltRad();
    expect(remembered).toBeGreaterThan(0.3);
    expect(Math.abs(displayTilt(state).tilt - remembered)).toBeLessThan(0.03); // converged

    // Round trip: out past disengage, then back in below engage. At every
    // notch the display must sit on the ONE mapping — pre-fix the zoom-in
    // leg was world-armed and pin-centred (tilt 0) through the whole window,
    // then walked 0.1/notch after the engage flip.
    const trace: { tilt: number; hr: number; arm: string }[] = [];
    const notch = (deltaY: number) => {
      push({ kind: 'wheel', deltaY, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
      trace.push({
        ...displayTilt(state),
        arm: state.cameraRuntime.lastPose.current.frame === 'absolute' ? 'abs' : 'body',
      });
    };
    for (let i = 0; i < 22; i += 1) notch(100);
    expect(trace[trace.length - 1]!.hr).toBeGreaterThan(4); // genuinely out
    for (let i = 0; i < 26; i += 1) notch(-100);
    expect(trace[trace.length - 1]!.hr).toBeLessThan(1.6); // genuinely back in

    let prevTilt = trace[0]!.tilt;
    for (const s of trace) {
      // The pure function, both arms, both directions. World-armed rows sit
      // on the map to 4 decimals (the projection is exact); engaged rows
      // carry the round-11 anchored-dive transient (the anchor-pivoted
      // restore is attenuated by the localUp chase — bounded, easing back),
      // hence the wider engaged bar. Pre-fix the world-armed zoom-in leg
      // deviated by up to 0.355 — remembered × w with nothing expressed.
      const bar = s.arm === 'abs' ? 0.01 : 0.09;
      expect(Math.abs(s.tilt - mappedTiltRad(remembered, s.hr))).toBeLessThan(bar);
      // No threshold step: a notch may move tilt by ~the map's own delta.
      expect(Math.abs(s.tilt - prevTilt)).toBeLessThan(0.09);
      prevTilt = s.tilt;
    }
    // The mapping really lerped back in (not "stayed 0 and never returned").
    expect(trace[trace.length - 1]!.tilt).toBeGreaterThan(0.8 * remembered);
  });
});
