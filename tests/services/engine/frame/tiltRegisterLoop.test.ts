/**
 * tiltRegisterLoop — R12b-1: the register holds the AUTHORED centre-looking
 * pose; the displayed pose is a pure projection derived at read. Pre-fix the
 * per-frame loop store-projected-pose → pivot pin → re-project walked the eye
 * 8,519 km per frame during ANY in-window drag — including press-and-hold
 * with zero pointer motion — while displayed tilt and h/R stayed constant
 * (invisible on screen, catastrophic in state). Real runFrame loop, real
 * gesture steps, same regime the round-12b review measured.
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
  startCameraTween,
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

function stepKm(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * MPC_TO_KM;
}

/**
 * Same approach recipe as tiltCommitIdempotence: dive engaged, set a large
 * remembered tilt through the controller's own handles, zoom out past
 * disengage, then back IN to mid-window (h/R ≈ 2.55) — world-armed,
 * pivot-pinned, projection live.
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
  expect(c.rememberedTiltRad()).toBeGreaterThan(0.5);

  while (display(state).hr < 3.6) notch(100);
  expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
  while (display(state).hr > 2.7) notch(-100);
  expect(display(state).hr).toBeGreaterThan(2.2);
  expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');

  for (let i = 0; i < 60; i += 1) frame();
  expect(display(state).tilt).toBeGreaterThan(0.2); // projection live here
  return { push, frame };
}

describe('the register loop during an active drag (R12b-1)', () => {
  it('press-and-hold with ZERO pointer motion leaves the eye byte-stable', () => {
    const harness = makeHarness();
    const { push, frame } = toMidWindow(harness);

    // Press and hold: dragging=true, an anchor, and no pointer motion at all.
    // Pre-fix every frame re-read the PROJECTED register, re-pinned it, and
    // re-projected — 8,519 km of eye walk per frame with tilt and h/R
    // constant (nothing on screen moves except the ground underneath).
    harness.store.dispatch(beginDrag());
    push({ kind: 'gestureStart' });
    push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    frame();

    const before = display(harness.state);
    for (let i = 0; i < 20; i += 1) {
      frame();
      const after = display(harness.state);
      expect(stepKm(before.eye, after.eye)).toBeLessThan(1e-9);
      expect(Math.abs(after.tilt - before.tilt)).toBeLessThan(1e-9);
    }
  });

  it('the register holds the AUTHORED centre-looking pose; readers see the projection', () => {
    const harness = makeHarness();
    const { push, frame } = toMidWindow(harness);

    harness.store.dispatch(beginDrag());
    push({ kind: 'gestureStart' });
    push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    push({ kind: 'dragMove', mode: 'orbit', xPx: 52, yPx: 50 });
    frame();

    // Authored register: centre-looking (tilt ~0). Displayed (what pick, the
    // clip/tween seams, and the draw path read via liveWorldPose): the full
    // mapped tilt. Same eye — the projection is eye-preserving by contract.
    const register = harness.state.cameraRuntime.lastPose.current;
    expect(register.frame).toBe('absolute');
    if (register.frame !== 'absolute') return;
    const registerEye = eyeMpcOf(register.pose, B);
    expect(tiltHrOf(register.pose, registerEye).tilt).toBeLessThan(1e-6);

    const displayed = display(harness.state);
    expect(displayed.tilt).toBeGreaterThan(0.2);
    expect(stepKm(registerEye, displayed.eye)).toBeLessThan(1e-9);
  });

  it('displayed pose is continuous through drag, release, and an edge deactivation', () => {
    const harness = makeHarness();
    const { push, frame } = toMidWindow(harness);
    let prev = display(harness.state);

    // A real 6-px drag across three frames, then release.
    harness.store.dispatch(beginDrag());
    push({ kind: 'gestureStart' });
    push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    for (const x of [52, 54, 56]) {
      push({ kind: 'dragMove', mode: 'orbit', xPx: x, yPx: 50 });
      frame();
      const cur = display(harness.state);
      // Each frame moves the eye by the 2-px drag mapping only — never a
      // teleport (pre-fix: ~8,519 km/frame rides on top of the drag).
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(500);
      prev = cur;
    }
    push({ kind: 'gestureEnd' });
    for (let i = 0; i < 10; i += 1) {
      frame();
      const cur = display(harness.state);
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(500);
      expect(Math.abs(cur.tilt - prev.tilt)).toBeLessThan(0.02);
      prev = cur;
    }

    // The commit-on-edge render override (autoRotate rate 0 start → stop):
    // the deactivation frame must render the displayed image, not a one-frame
    // untilted pop, and must not re-pin the projected pose (no eye step).
    harness.store.dispatch(setAutoRotate({ active: true, rate: 0 }));
    for (let i = 0; i < 10; i += 1) frame();
    prev = display(harness.state);
    harness.store.dispatch(setAutoRotate({ active: false, rate: 0 }));
    for (let i = 0; i < 10; i += 1) {
      frame();
      const cur = display(harness.state);
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(1e-6);
      expect(Math.abs(cur.tilt - prev.tilt)).toBeLessThan(1e-6);
      prev = cur;
    }
  });

  it('a fresh followBody capture in-window starts from the authored pose (no re-pin walk)', () => {
    const harness = makeHarness();
    const { frame } = toMidWindow(harness);

    // Re-select the same body: a fresh focus ROW reference re-arms the follow
    // ease, whose `from` capture pairs captured yaw/pitch with a body-centred
    // target. Captured from the DISPLAYED (tilted) pose that decode walks the
    // eye by d·2sin(τ/2) ≈ 8,519 km on the first eased frame — the capture
    // must read the authored register instead.
    const prev = display(harness.state);
    harness.store.dispatch(
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
    frame();
    const cur = display(harness.state);
    expect(stepKm(prev.eye, cur.eye)).toBeLessThan(1000);
  });

  it('a tween start in-window (NON-pivoting incoming driver) draws the displayed image on the edge frame', () => {
    const harness = makeHarness();
    const { frame } = toMidWindow(harness);
    const before = display(harness.state);

    // Seed the tween the way watchFocusTweenSaga does: `from` = the DISPLAYED
    // live pose. The followBody→tween deactivation edge fires with an incoming
    // driver that neither pins nor projects, so an authored (untilted) render
    // override flashes 0.40 rad ≈ 453 px to nadir for exactly one frame
    // (R12c-1) — the override must fall back to the displayed box there.
    const from = liveWorldPose(harness.state);
    harness.store.dispatch(
      startCameraTween({
        from,
        to: { ...from, target: [...from.target] as Vec3, distance: from.distance * 1.5 },
        durationMs: 400,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    frame(); // the edge frame: followBody commits, the override renders
    const edge = display(harness.state);
    expect(Math.abs(edge.tilt - before.tilt)).toBeLessThan(0.01);

    // And the register stayed AUTHORED (R12c-4a): the displayed override must
    // not be stamped back into it — a drag folding from a projected register
    // on the next drain re-opens the walk.
    const register = harness.state.cameraRuntime.lastPose.current;
    expect(register.frame).toBe('absolute');
    if (register.frame !== 'absolute') return;
    const registerEye = eyeMpcOf(register.pose, B);
    expect(tiltHrOf(register.pose, registerEye).tilt).toBeLessThan(1e-6);
  });
});
