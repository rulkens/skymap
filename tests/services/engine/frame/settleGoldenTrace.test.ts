/**
 * settleGoldenTrace — the byte bar for the orientation-settle mechanisms:
 * one fixed gesture script through the real `runFrame` loop (both arms, both
 * `northUp` states), with the displayed pose, the authored register and the
 * tilt memory recorded per step to 12 significant digits. A refactor of the
 * settles must pass it unmodified; re-record (`SETTLE_GOLDEN_RECORD=1`) only
 * for a RULED behaviour change, and say so in the commit.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
import { ORIENT_TUNING } from '../../../../src/data/camera/orientTuning';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import GOLDEN from '../../../fixtures/camera/settleGoldenTrace.json';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { InputGestureEvent } from '../../../../src/@types/camera/InputGestureEvent';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const EARTH = deriveBodyStates(SIM).get('earth')! as BodyState;
const R_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
const FIXTURE_PATH = fileURLToPath(
  new URL('../../../fixtures/camera/settleGoldenTrace.json', import.meta.url),
);
const DIGITS = 12;

type Step = {
  readonly label: string;
  readonly arm: string;
  readonly hr: number;
  readonly displayed: readonly number[];
  readonly register: readonly number[];
  readonly memory: number;
};
type Trace = readonly Step[];

function poseAtHR(hr: number): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: R_MPC * (1 + hr),
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
      lastPose: { current: absoluteArm(poseAtHR(5)) },
      displayedPose: { current: absoluteArm(poseAtHR(5)) },
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
  store.dispatch(commitCameraPose(absoluteArm(poseAtHR(5))));
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

const sig = (x: number): number => Number(x.toPrecision(DIGITS));

// Every STRIDEth step, PLUS every leg's first/last step and every arm change
// (a latched-mode flip) — a regression inside a dropped step still shows up
// at the next kept one, since register/memory carry forward frame-to-frame.
const STRIDE = 40;
const legOf = (label: string): string =>
  label.replace(/ move \d+$/, '').replace(/ end$/, '').replace(/ \d+$/, '');
function thin(trace: Trace): Trace {
  const keep = new Set<number>();
  trace.forEach((step, i) => {
    if (i % STRIDE === 0) keep.add(i);
    if (i === 0 || legOf(step.label) !== legOf(trace[i - 1]!.label)) keep.add(i);
    if (i === trace.length - 1 || legOf(step.label) !== legOf(trace[i + 1]!.label)) keep.add(i);
    if (i > 0 && step.arm !== trace[i - 1]!.arm) keep.add(i);
  });
  return [...keep].sort((a, b) => a - b).map((i) => trace[i]!);
}

function snapshot(state: EngineState, label: string): Step {
  const live = liveWorldPose(state);
  const eye = eyeMpcOf(live, B);
  const hr =
    Math.hypot(
      eye[0]! - EARTH.positionMpc[0]!,
      eye[1]! - EARTH.positionMpc[1]!,
      eye[2]! - EARTH.positionMpc[2]!,
    ) /
      R_MPC -
    1;
  const reg = state.cameraRuntime.lastPose.current;
  const register =
    reg.frame === 'absolute'
      ? [...reg.pose.target, reg.pose.yaw, reg.pose.pitch, reg.pose.distance, reg.pose.roll ?? 0]
      : [...reg.pose.anchorLocalM, ...reg.pose.eyeRelAnchorM, ...reg.pose.basisLocal];
  return {
    label,
    arm: reg.frame === 'absolute' ? 'absolute' : reg.frame.body,
    hr: sig(hr),
    displayed: [...live.target, live.yaw, live.pitch, live.distance, live.roll ?? 0].map(sig),
    register: register.map(sig),
    memory: sig(state.cameraRuntime.surface.rememberedTiltRad()),
  };
}

/**
 * The script: focused dive from 5 R with the cursor off-centre through the
 * band and on to the standoff floor (brisk notches below the band, so the
 * ride bound is exercised too), a tilt drag, a pan, a second tilt drag past
 * the horizon, a look at the sky, then a recession out past disengage.
 */
function runScript(): Trace {
  const { store, state, deps } = makeHarness();
  const push = (e: InputGestureEvent) => state.subsystems.inputAggregator.push(e);
  let now = 0;
  const frame = () => runFrame(state, deps, (now += 16));
  const trace: Step[] = [];
  const record = (label: string) => trace.push(snapshot(state, label));

  const notch = (deltaY: number, xPx: number, yPx: number, label: string) => {
    push({ kind: 'wheel', deltaY, duringGesture: false, xPx, yPx });
    frame();
    frame();
    record(label);
  };
  const drag = (
    mode: 'orbit' | 'pan',
    from: readonly [number, number],
    moves: readonly (readonly [number, number])[],
    label: string,
    expectMode: string,
  ) => {
    store.dispatch(beginDrag());
    push({ kind: 'gestureStart' });
    push({ kind: 'dragAnchor', xPx: from[0], yPx: from[1] });
    moves.forEach(([x, y], i) => {
      push({ kind: 'dragMove', mode, xPx: x, yPx: y });
      frame();
      record(`${label} move ${i}`);
    });
    // The script must exercise the mode it names, or the trace is silently
    // pinning a different gesture.
    expect(state.cameraRuntime.surface.debugGesture()?.gesture?.mode).toBe(expectMode);
    push({ kind: 'gestureEnd' });
    frame();
    record(`${label} end`);
  };
  const column = (x: number, y0: number, y1: number, step: number) => {
    const out: (readonly [number, number])[] = [];
    for (let y = y0; step > 0 ? y <= y1 : y >= y1; y += step) out.push([x, y]);
    return out;
  };

  frame();
  record('start');
  for (let i = 0; i < 40; i += 1) notch(-100, 65, 40, `dive ${i}`);
  expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');
  for (let i = 0; i < 36; i += 1) notch(-300, 65, 40, `dive brisk ${i}`);
  expect(trace[trace.length - 1]!.hr).toBeLessThan(1e-5); // at the standoff floor

  drag('pan', [50, 90], column(50, 85, 10, -5), 'tilt 1', 'tilt');
  drag(
    'orbit',
    [50, 50],
    [
      [55, 50],
      [60, 50],
      [65, 50],
      [70, 50],
      [72, 48],
    ],
    'pan',
    'pan',
  );
  drag('pan', [50, 90], column(50, 85, 10, -5), 'tilt 2', 'tilt');
  drag(
    'orbit',
    [50, 5],
    [
      [55, 5],
      [60, 5],
      [60, 10],
    ],
    'look',
    'look',
  );

  for (let i = 0; i < 36; i += 1) notch(300, 50, 50, `recede brisk ${i}`);
  let i = 0;
  while (state.cameraRuntime.lastPose.current.frame !== 'absolute' && i < 40) {
    notch(100, 50, 50, `recede ${i}`);
    i += 1;
  }
  expect(state.cameraRuntime.lastPose.current.frame).toBe('absolute');
  for (let j = 0; j < 8; j += 1) notch(100, 50, 50, `recede world ${j}`);
  // Back in through the window world-armed with a non-zero memory: the only
  // leg on which the world arm's tilt projection is live.
  i = 0;
  while (state.cameraRuntime.lastPose.current.frame === 'absolute' && i < 40) {
    notch(-100, 40, 60, `re-dive ${i}`);
    i += 1;
  }
  expect(state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');
  for (let j = 0; j < 4; j += 1) notch(-100, 40, 60, `re-dive engaged ${j}`);
  return trace;
}

const TUNING_AT_LOAD = { ...ORIENT_TUNING };
afterEach(() => {
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
});

function expectTraceMatches(actual: Trace, golden: Trace): void {
  expect(actual.length).toBe(golden.length);
  actual.forEach((step, i) => {
    const want = golden[i]!;
    expect(step.label, `step ${i}`).toBe(want.label);
    expect(step.arm, `step ${i} ${step.label}`).toBe(want.arm);
    const rows: [string, readonly number[], readonly number[]][] = [
      ['hr', [step.hr], [want.hr]],
      ['displayed', step.displayed, want.displayed],
      ['register', step.register, want.register],
      ['memory', [step.memory], [want.memory]],
    ];
    for (const [name, got, exp] of rows) {
      expect(got.length, `step ${i} ${step.label} ${name}`).toBe(exp.length);
      got.forEach((g, k) => {
        const e = exp[k]!;
        // Both sides are rounded to DIGITS, so a match is exact; the message
        // names the step and field on the first mismatch.
        expect(g, `step ${i} (${step.label}) ${name}[${k}]`).toBe(e);
      });
    }
  });
}

describe('settle golden trace (byte bar for the orientation settles)', () => {
  const states: [string, boolean][] = [
    ['northUp', true],
    ['northUpOff', false],
  ];
  // Record mode accumulates across the two cases in-process: the JSON import
  // is read once, so merging into it per case would drop the earlier key.
  const recorded: Record<string, Trace> = { ...(GOLDEN as Record<string, Trace>) };
  for (const [key, northUp] of states) {
    it(`matches the recorded trace with northUp = ${northUp}`, () => {
      ORIENT_TUNING.northUp = northUp;
      const trace = thin(runScript());
      if (process.env['SETTLE_GOLDEN_RECORD']) {
        recorded[key] = trace;
        writeFileSync(FIXTURE_PATH, `${JSON.stringify(recorded)}\n`);
        return;
      }
      expectTraceMatches(trace, (GOLDEN as Record<string, Trace>)[key]!);
    });
  }
});
