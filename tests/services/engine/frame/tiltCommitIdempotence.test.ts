/**
 * tiltCommitIdempotence — R12-1: `camera.base` stays centre-looking by
 * WIRING. The tilt projection (`approachTiltedPose`) holds the eye by moving
 * `target` off the body centre; the pivot pin SETS target to the centre and
 * derives the eye — composing them on a COMMITTED tilted pose moves the eye
 * by d·2sin(τ/2) (~8,400 km at remembered 1.0, h/R 2.55) and ACCUMULATES
 * over commit→re-derive cycles. The round-12 sim committed once at h/R 10
 * then only read; this fixture commits mid-window, where the two contracts
 * actually compose. Real runFrame loop, real gesture steps.
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
import {
  beginDrag,
  commitCameraPose,
  setAutoRotate,
} from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays, pause } from '../../../../src/state/time/timeSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
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
const MPC_TO_KM = 1 / SCALE_UNITS.M_TO_MPC / 1000;

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
      displayedPose: { current: absoluteArm(poseAtHR(10, 0)) },
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

/** Displayed pose vs Earth: eye, h/R, and angle(view axis, nadir). */
function display(state: EngineState): { eye: Vec3; tilt: number; hr: number } {
  const live = liveWorldPose(state);
  const eye = eyeMpcOf(live, B);
  return { eye, ...tiltHrOf(live, eye) };
}

function tiltHrOf(pose: CameraPose, eye: Vec3): { tilt: number; hr: number } {
  const rel: Vec3 = [
    eye[0]! - EARTH.positionMpc[0]!,
    eye[1]! - EARTH.positionMpc[1]!,
    eye[2]! - EARTH.positionMpc[2]!,
  ];
  const mag = Math.hypot(...rel);
  const n = normalize3(rel);
  const forward = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const vert = forward[0]! * n[0]! + forward[1]! * n[1]! + forward[2]! * n[2]!;
  return { tilt: Math.acos(Math.max(-1, Math.min(1, -vert))), hr: mag / R_MPC - 1 };
}

/**
 * Shared approach: dive engaged, set a large remembered tilt through the
 * controller's own handles, zoom out past disengage, then back IN to
 * mid-window (h/R ≈ 2.55) — the world-armed, pivot-pinned, projection-live
 * standpoint where the round-12 review measured the teleport.
 */
function toMidWindow(harness: ReturnType<typeof makeHarness>) {
  const { state } = harness;
  const push = (state.subsystems.inputAggregator as { push: Push }).push;
  let now = 0;
  const frame = () => runFrame(state, harness.deps, (now += 16));
  const notch = (deltaY: number) => {
    push({ kind: 'wheel', deltaY, duringGesture: false, xPx: 50, yPx: 50 });
    frame();
    frame();
  };

  for (let i = 0; i < 14; i += 1) notch(-100);
  expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');

  // Set the memory via the controller's handles (unit-radius; the memory is
  // session state — same rationale as tiltLerpRoundTrip's harness).
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
    { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 30] },
    [100, 100],
    Math.PI / 2,
    1,
    [0, 0, 1],
  );
  c.onGestureEnd();
  for (let g = 0; g < 40 && c.rememberedTiltRad() < 0.95; g += 1) {
    c.onGestureStart();
    for (let px = 5; px < 90 && c.rememberedTiltRad() < 0.95; px += 5) {
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
  const remembered = c.rememberedTiltRad();
  expect(remembered).toBeGreaterThan(0.5);

  // Out past disengage (arm flips absolute), back in to mid-window; the
  // hysteresis keeps the leg world-armed until engage at 1.7.
  while (display(state).hr < 3.6) notch(100);
  expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
  while (display(state).hr > 2.7) notch(-100);
  const { hr } = display(state);
  expect(hr).toBeGreaterThan(2.2);
  expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');

  // Let the follow ease and the projection settle before measuring.
  for (let i = 0; i < 60; i += 1) frame();
  expect(display(state).tilt).toBeGreaterThan(0.2); // projection live here
  return { push, frame, remembered };
}

describe('commit → re-derive idempotence (R12-1)', () => {
  it('repeated in-window commits leave the eye fixed', () => {
    const harness = makeHarness();
    const { push, frame } = toMidWindow(harness);

    // Each cycle: an empty in-window gesture (press + release) — gestureEnd
    // commits the register — then frames for the pin + projection to
    // re-derive. Pre-fix each commit bakes the TILTED pose and the pin
    // moves the eye d·2sin(τ/2) ≈ thousands of km, accumulating per cycle.
    const eyes: Vec3[] = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      harness.store.dispatch(beginDrag());
      push({ kind: 'gestureStart' });
      push({ kind: 'gestureEnd' });
      for (let i = 0; i < 60; i += 1) frame();
      eyes.push(display(harness.state).eye);
    }
    // The OTHER reachable commit path (b): a commit-on-edge. Rate 0 so the
    // spin authors no motion — a start/stop pair is a pure commit cycle
    // through runFrame's edge bake rather than drainInput's gestureEnd.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      harness.store.dispatch(setAutoRotate({ active: true, rate: 0 }));
      for (let i = 0; i < 10; i += 1) frame();
      harness.store.dispatch(setAutoRotate({ active: false, rate: 0 }));
      for (let i = 0; i < 60; i += 1) frame();
      eyes.push(display(harness.state).eye);
    }
    for (let cycle = 1; cycle < eyes.length; cycle += 1) {
      const [a, b] = [eyes[cycle - 1]!, eyes[cycle]!];
      const jumpKm = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * MPC_TO_KM;
      expect(jumpKm).toBeLessThan(1);
    }
  });

  it('an in-window drag release commits a centre-looking base with no visual pop', () => {
    const harness = makeHarness();
    const { push, frame } = toMidWindow(harness);
    const before = display(harness.state);

    harness.store.dispatch(beginDrag());
    push({ kind: 'gestureStart' });
    push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    push({ kind: 'dragMove', mode: 'orbit', xPx: 52, yPx: 50 });
    push({ kind: 'gestureEnd' });
    frame();

    // The committed base is centre-looking — the projection stayed render-side.
    const base = harness.store.getState().camera.base;
    expect(base.frame).toBe('absolute');
    if (base.frame !== 'absolute') return;
    const baseEye = eyeMpcOf(base.pose, B);
    expect(tiltHrOf(base.pose, baseEye).tilt).toBeLessThan(1e-6);

    // And the DISPLAYED tilt is unchanged across the commit (no pop).
    for (let i = 0; i < 8; i += 1) frame();
    const after = display(harness.state);
    expect(Math.abs(after.tilt - before.tilt)).toBeLessThan(0.02);
    // The release itself moved the eye by at most the 2 px drag, not a teleport.
    const shiftKm =
      Math.hypot(
        before.eye[0]! - after.eye[0]!,
        before.eye[1]! - after.eye[1]!,
        before.eye[2]! - after.eye[2]!,
      ) * MPC_TO_KM;
    expect(shiftKm).toBeLessThan(500);
  });
});
