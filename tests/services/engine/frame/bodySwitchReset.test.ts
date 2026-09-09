/**
 * bodySwitchReset — ruling 18: a body switch fully resets the body pose.
 * Pre-fix, focusing Saturn from an engaged Earth camera stranded the eye
 * INSIDE Saturn at 0.26 R: followBody's capture carried the Earth-orbit
 * distance (~2.4 R⊕ = 0.26 R♄) across the switch, the fold engaged Saturn on
 * the first eased frame (h/R < 0 < engage, focus matching), and the body arm
 * then blocked followBody (absolute-arm gate) with disengage unreachable.
 * The remembered tilt also survived the switch. Real runFrame loop.
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
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
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
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SURFACE_REGIME } from '../../../../src/data/camera/surfaceRegime';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const BODIES = deriveBodyStates(SIM);
const EARTH = BODIES.get('earth')! as BodyState;
const SATURN = BODIES.get('saturn')! as BodyState;
const R_EARTH_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
const R_SATURN_M = 58232000;
const R_SATURN_MPC = R_SATURN_M * SCALE_UNITS.M_TO_MPC;
// The harness settings put fovDeg 60 on the store; runFrame stamps it onto
// the projection every frame, so the framing target is computed at π/3.
const FRAMING_MPC = bodyFocusDistance(R_SATURN_MPC, Math.PI / 3);

function poseAtHR(hr: number): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: R_EARTH_MPC * (1 + hr),
    roll: 0,
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
      lastPose: { current: absoluteArm(poseAtHR(10)) },
      displayedPose: { current: absoluteArm(poseAtHR(10)) },
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
  store.dispatch(commitCameraPose(absoluteArm(poseAtHR(10))));
  focusBody(store, 'earth', 'Earth', EARTH.positionMpc, SCENE_EARTH.radiusM);
  return { store, state, deps };
}

function focusBody(
  store: ReturnType<typeof makeHarness>['store'],
  id: string,
  label: string,
  positionMpc: Readonly<Vec3>,
  radiusM: number,
): void {
  store.dispatch(
    setSelectionRow({
      slot: 'focus',
      row: {
        type: 'body',
        id,
        label,
        positionMpc: [positionMpc[0]!, positionMpc[1]!, positionMpc[2]!],
        radiusM,
      },
    }),
  );
}

function distTo(eye: Readonly<Vec3>, body: BodyState): number {
  return Math.hypot(
    eye[0]! - body.positionMpc[0]!,
    eye[1]! - body.positionMpc[1]!,
    eye[2]! - body.positionMpc[2]!,
  );
}

/** Displayed h/R over Earth. */
function hrOverEarth(state: EngineState): number {
  return distTo(eyeMpcOf(liveWorldPose(state), B), EARTH) / R_EARTH_MPC - 1;
}

/** Displayed tilt from the body's nadir, off the DISPLAYED (on-screen) pose. */
function displayedTiltAt(state: EngineState, body: BodyState): number {
  const live = liveWorldPose(state);
  const eye = eyeMpcOf(live, B);
  const n = normalize3([
    eye[0]! - body.positionMpc[0]!,
    eye[1]! - body.positionMpc[1]!,
    eye[2]! - body.positionMpc[2]!,
  ] as Vec3);
  const f = normalize3([
    live.target[0]! - eye[0]!,
    live.target[1]! - eye[1]!,
    live.target[2]! - eye[2]!,
  ] as Vec3);
  const vert = f[0]! * n[0]! + f[1]! * n[1]! + f[2]! * n[2]!;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

/**
 * Seed the remembered tilt through the controller's own handles (~0.35).
 * h/R 0.15: inside the band, where the handles write the memory (w = 1)
 * and the tilt ceiling is open.
 */
function seedRememberedTilt(state: EngineState): void {
  const c = state.cameraRuntime.surface;
  let p: BodyFixedPose = {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [0, 0, 1.15],
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
  for (let g = 0; g < 6 && c.rememberedTiltRad() < 0.35; g += 1) {
    c.onGestureStart();
    for (let px = 5; px < 90 && c.rememberedTiltRad() < 0.35; px += 2) {
      p = c.apply(
        p,
        { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + 2] },
        [100, 100],
        Math.PI / 2,
        1,
        [0, 0, 1],
      );
    }
    c.onGestureEnd();
  }
}

describe('body switch reset (ruling 18)', () => {
  it('engaged Earth + remembered tilt → focus Saturn: lands OUTSIDE at the framing distance, tilt and memory reset', () => {
    const { store, state, deps } = makeHarness();
    const push = (state.subsystems.inputAggregator as unknown as { push: (x: unknown) => void })
      .push;
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    // Dive into the Earth surface regime and author a tilt there.
    for (let i = 0; i < 32; i += 1) {
      push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');
    seedRememberedTilt(state);
    expect(state.cameraRuntime.surface.rememberedTiltRad()).toBeGreaterThan(0.3);

    // The user's action. The real saga path dispatches NO tween for a moving
    // body (watchFocusTweenSaga gates on bodyMovesThisFrame) — followBody IS
    // the flight, so the store focus write alone reproduces the app flow.
    focusBody(store, 'saturn', 'Saturn', SATURN.positionMpc, R_SATURN_M);

    // Pre-fix f1 put the eye at 0.259 R♄ (inside) and engaged there; every
    // post-switch frame must stay outside the planet.
    for (let i = 0; i < 200; i += 1) {
      frame();
      expect(distTo(eyeMpcOf(liveWorldPose(state), B), SATURN)).toBeGreaterThan(R_SATURN_MPC);
    }

    // Arrival: the actual focus framing distance (outside, FOV-framed), the
    // approach not stranded by a bogus engage (followBody still owns the
    // frame on the absolute arm), a centre-looking display, and the memory
    // read back as 0.
    const dSat = distTo(eyeMpcOf(liveWorldPose(state), B), SATURN);
    expect(Math.abs(dSat - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
    expect(state.cameraRuntime.prevActiveId.current).toBe('followBody');
    expect(displayedTiltAt(state, SATURN)).toBeLessThan(1e-6);
    expect(state.cameraRuntime.surface.rememberedTiltRad()).toBe(0);
  });

  it('a body switch is a FLIGHT to the framing distance, never a cut', () => {
    const { store, state, deps } = makeHarness();
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    // Settle the session's first follow at Earth, then switch to Saturn.
    for (let i = 0; i < 80; i += 1) frame();
    focusBody(store, 'saturn', 'Saturn', SATURN.positionMpc, R_SATURN_M);

    // The eye starts where it was (Earth's neighbourhood, ~2e4 R♄ out) and
    // approaches monotonically; a capture that adopts the framing distance
    // as its START teleports the eye there on the first frame.
    const ds: number[] = [];
    for (let i = 0; i < 150; i += 1) {
      frame();
      ds.push(distTo(eyeMpcOf(liveWorldPose(state), B), SATURN));
    }
    expect(ds[0]!).toBeGreaterThan(FRAMING_MPC * 10);
    for (let i = 1; i < ds.length; i += 1) {
      expect(ds[i]!).toBeLessThanOrEqual(ds[i - 1]! * (1 + 1e-9));
    }
    expect(Math.abs(ds[ds.length - 1]! - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
    expect(state.cameraRuntime.prevActiveId.current).toBe('followBody');
  });

  it("the session's FIRST follow lands at the framing distance too", () => {
    const { store, state, deps } = makeHarness();
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    // 11 R⊕ from Earth's centre is 1.2 R♄: a capture that carries that
    // distance across to Saturn engages there and never reaches the framing.
    focusBody(store, 'saturn', 'Saturn', SATURN.positionMpc, R_SATURN_M);
    for (let i = 0; i < 200; i += 1) {
      frame();
      expect(distTo(eyeMpcOf(liveWorldPose(state), B), SATURN)).toBeGreaterThan(R_SATURN_MPC);
    }
    const dSat = distTo(eyeMpcOf(liveWorldPose(state), B), SATURN);
    expect(Math.abs(dSat - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
  });

  it('same-body disengage/re-engage (with a null-focus stint) keeps the memory', () => {
    const { store, state, deps } = makeHarness();
    const push = (state.subsystems.inputAggregator as unknown as { push: (x: unknown) => void })
      .push;
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    for (let i = 0; i < 32; i += 1) {
      push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');
    seedRememberedTilt(state);
    const remembered = state.cameraRuntime.surface.rememberedTiltRad();
    expect(remembered).toBeGreaterThan(0.3);

    // Recede past disengage, clear the focus for a stint, re-focus Earth,
    // and dive back into the band — never a DIFFERENT body, so the memory
    // must survive the whole trip (round 11 standing for the same body).
    for (let g = 0; g < 40 && hrOverEarth(state) < SURFACE_REGIME.disengageHR * 1.25; g += 1) {
      push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
    store.dispatch(setSelectionRow({ slot: 'focus', row: null }));
    for (let i = 0; i < 10; i += 1) frame();
    focusBody(store, 'earth', 'Earth', EARTH.positionMpc, SCENE_EARTH.radiusM);
    for (let i = 0; i < 10; i += 1) frame();
    for (let g = 0; g < 40 && hrOverEarth(state) > SURFACE_REGIME.engageHR * 0.75; g += 1) {
      push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 50, yPx: 50 });
      frame();
      frame();
    }
    expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');
    expect(state.cameraRuntime.surface.rememberedTiltRad()).toBeCloseTo(remembered, 10);
  });

  it('a body switch while ABSOLUTE (never engaged on the new body) also resets the memory', () => {
    const { store, state, deps } = makeHarness();
    let now = 0;
    const frame = () => runFrame(state, deps, (now += 16));

    // Absolute at h/R 10 over Earth, Earth focused; one frame binds the
    // memory's body, then the tilt is authored (session state — the write
    // path itself is pinned in rememberedTilt.test.ts).
    frame();
    seedRememberedTilt(state);
    expect(state.cameraRuntime.surface.rememberedTiltRad()).toBeGreaterThan(0.3);

    focusBody(store, 'saturn', 'Saturn', SATURN.positionMpc, R_SATURN_M);
    frame();
    frame();
    expect(state.cameraRuntime.surface.rememberedTiltRad()).toBe(0);
  });
});
