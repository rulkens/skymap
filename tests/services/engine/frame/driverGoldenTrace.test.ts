/**
 * driverGoldenTrace — the byte bar for camera-driver arbitration, the five
 * clock epochs and the per-frame action stream. One scripted session through
 * the real `runFrame` loop touches every driver row in the table and every
 * epoch that can start; the winner, both pose registers, the follow memory,
 * the epochs and the action types dispatched inside each frame are recorded to
 * 12 significant digits. A refactor of the camera runtime must pass it
 * unmodified; re-record (`DRIVER_GOLDEN_RECORD=1`) only for a RULED behaviour
 * change, and say so in the commit.
 */

import { describe, it, expect, vi } from 'vitest';
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

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import { spin } from '../../../../src/services/engine/animation/effectHelpers';
import {
  beginDrag,
  clipStarted,
  resolveClipStart,
  setAutoRotate,
  startCameraTween,
} from '../../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import GOLDEN from '../../../fixtures/camera/driverGoldenTrace.json';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const FIXTURE_PATH = fileURLToPath(
  new URL('../../../fixtures/camera/driverGoldenTrace.json', import.meta.url),
);
const DIGITS = 12;
const HARNESS_FRAME_MS = 16;
const BOOT_HR = 5;
const TWEEN_MS = 320;
const CLIP_SEC = 0.4;
/** One and a half laps of the looping clip: exactly one rewind. */
const CLIP_LAPS = 1.5;

const EPOCH_NAMES = ['tween', 'frameTween', 'autoRotate', 'follow', 'clip'] as const;
type EpochName = (typeof EPOCH_NAMES)[number];

type EpochCell = { readonly startMs: number | null; readonly refNull: boolean };
type FollowCell = {
  readonly fromDistance: number | null;
  readonly distanceTarget: number | null;
  readonly panOffset: readonly number[];
};
type Step = {
  readonly label: string;
  readonly winner: string;
  readonly displayed: readonly number[];
  readonly register: readonly number[];
  readonly follow: FollowCell;
  readonly epochs: Readonly<Record<EpochName, EpochCell>>;
  readonly actions: readonly string[];
};
type Trace = readonly Step[];

const sig = (x: number): number => Number(x.toPrecision(DIGITS));
const sigOrNull = (x: number | null): number | null => (x === null ? null : sig(x));

function snapshot(state: EngineState, label: string, actions: readonly string[]): Step {
  const live = liveWorldPose(state);
  const reg = state.cameraRuntime.lastPose.current;
  const register =
    reg.frame === 'absolute'
      ? [...reg.pose.target, reg.pose.yaw, reg.pose.pitch, reg.pose.distance, reg.pose.roll ?? 0]
      : [...reg.pose.anchorLocalM, ...reg.pose.eyeRelAnchorM, ...reg.pose.basisLocal];
  const clock = state.cameraRuntime.clock;
  return {
    label,
    // Step 4 of `runFrame` stamps the winner it produced from, so this is the
    // arbitration result itself, not a re-resolution against a moved store.
    winner: state.cameraRuntime.prevActiveId.current,
    displayed: [...live.target, live.yaw, live.pitch, live.distance, live.roll ?? 0].map(sig),
    register: register.map(sig),
    follow: {
      fromDistance: clock.followFrom === null ? null : sig(clock.followFrom.distance),
      distanceTarget: sigOrNull(clock.followDistanceTarget),
      panOffset: [...clock.followPanOffset].map(sig),
    },
    epochs: {
      tween: { startMs: sigOrNull(clock.tweenStartMs), refNull: clock.lastTweenRef === null },
      frameTween: {
        startMs: sigOrNull(clock.frameTweenStartMs),
        refNull: clock.lastFrameTweenRef === null,
      },
      // The autoRotate row's reset reference is `active ? base : null`: the
      // active bit carries the nullness, `lastBaseRef` only the identity inside it.
      autoRotate: {
        startMs: sigOrNull(clock.autoRotateStartMs),
        refNull: !clock.lastAutoRotateActive,
      },
      follow: { startMs: sigOrNull(clock.followStartMs), refNull: clock.lastFollowRef === null },
      clip: { startMs: sigOrNull(clock.clipStartMs), refNull: clock.lastClipRef === null },
    },
    actions,
  };
}

/**
 * The script: boot resting, an at-rest orbit drag (the only leg that reaches
 * `orbitDrag` and the gesture-end action pair), focus Earth for the follow
 * approach, a notch mid-approach the follow swallows, autoRotate and a notch
 * under it, a tween run to its cancel edge, a looping clip run past its
 * duration, then clip stop / autoRotate off / focus cleared.
 */
function runScript(): Trace {
  const harness = makeCameraSimHarness({ focusBody: null, bootHR: BOOT_HR });
  const { store, state } = harness;

  const actions: string[] = [];
  const inner = store.dispatch.bind(store);
  store.dispatch = ((action: { type: string }) => {
    actions.push(action.type);
    return inner(action as never);
  }) as typeof store.dispatch;

  // The harness stubs the player out; the loop rewind is a leg of this script,
  // and it rides the same clock the driver table reads.
  state.subsystems.clipPlayer = createClipPlayer({
    store,
    requestRender: () => {},
    clock: state.cameraRuntime.clock,
    getEngineState: () => state,
  });

  const trace: Step[] = [];
  // One step per frame from a zero start, so the length IS the script clock.
  const nowMs = (): number => trace.length * HARNESS_FRAME_MS;
  const step = (label: string): Step => {
    actions.length = 0;
    harness.frame();
    const recorded = snapshot(state, label, [...actions]);
    trace.push(recorded);
    return recorded;
  };
  const steps = (count: number, label: string): Step => {
    let last = step(`${label} 0`);
    for (let i = 1; i < count; i += 1) last = step(`${label} ${i}`);
    return last;
  };
  const notch = (label: string): void => {
    harness.push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 50, yPx: 50 });
    step(`${label} a`);
    step(`${label} b`);
  };

  expect(steps(4, 'boot').winner).toBe('resting');

  store.dispatch(beginDrag());
  harness.push({ kind: 'gestureStart' });
  harness.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
  for (let i = 0; i < 4; i += 1) {
    harness.push({ kind: 'dragMove', mode: 'orbit', xPx: 50 + 6 * i, yPx: 50 });
    expect(step(`drag ${i}`).winner).toBe('orbitDrag');
  }
  harness.push({ kind: 'gestureEnd' });
  step('drag end');

  harness.focus('earth');
  const followStart = nowMs();
  expect(steps(10, 'follow').winner).toBe('followBody');

  const targetBeforeNotch = state.cameraRuntime.clock.followDistanceTarget;
  notch('notch under follow');
  // The leg is the notch the follow driver SWALLOWS: it must land while the
  // ease is still running, and it must move the driver's own target.
  expect(nowMs() - followStart).toBeLessThan(FOCUS_TWEEN_MS);
  expect(state.cameraRuntime.clock.followDistanceTarget).not.toBe(targetBeforeNotch);
  steps(24, 'follow settle');

  const { rate } = store.getState().camera.autoRotate;
  store.dispatch(setAutoRotate({ active: true, rate }));
  expect(steps(3, 'autoRotate').winner).toBe('autoRotate');
  notch('notch under autoRotate');
  steps(3, 'autoRotate settle');

  const from = liveWorldPose(state);
  store.dispatch(
    startCameraTween({
      from,
      to: { ...from, yaw: from.yaw + 0.4, distance: from.distance * 1.5 },
      durationMs: TWEEN_MS,
      easing: 'easeInOutCubic',
      frame: DEFAULT_ORIENTATION,
    }),
  );
  const tweenLeg = trace.length;
  steps(TWEEN_MS / HARNESS_FRAME_MS + 4, 'tween');
  const tweenSteps = trace.slice(tweenLeg);
  expect(tweenSteps.some((s) => s.winner === 'tween')).toBe(true);
  expect(tweenSteps.some((s) => s.actions.includes('camera/cancelCameraTween'))).toBe(true);

  store.dispatch(
    clipStarted({
      data: resolveClipStart(
        { timeline: [spin('yaw', { by: Math.PI / 2, over: CLIP_SEC })], loop: true },
        liveWorldPose(state),
      ),
      frame: DEFAULT_ORIENTATION,
    }),
  );
  const clipLeg = trace.length;
  const clipFrames = Math.round((CLIP_SEC * CLIP_LAPS * 1000) / HARNESS_FRAME_MS);
  expect(steps(clipFrames, 'clip').winner).toBe('clip');
  // The rewind, observed: the clip epoch start moves once inside the leg.
  const clipStarts = new Set(trace.slice(clipLeg).map((s) => s.epochs.clip.startMs));
  expect(clipStarts.size).toBe(2);

  state.subsystems.clipPlayer.stop();
  store.dispatch(setAutoRotate({ active: false, rate }));
  harness.focus(null);
  expect(steps(6, 'teardown').winner).toBe('resting');

  return trace;
}

/**
 * Kept: every leg edge, every winner change, every frame whose action list
 * differs from its predecessor's, plus a stride floor. Everything dropped is
 * inside a run of identical winner and identical actions, and the pose columns
 * carry forward frame-to-frame, so a regression inside one still shows at the
 * next kept step.
 */
const STRIDE = 8;
const legOf = (label: string): string => label.replace(/ (a|b|end|\d+)$/, '');
function thin(trace: Trace): Trace {
  const keep = new Set<number>();
  const sameActions = (a: Step, b: Step): boolean =>
    a.actions.length === b.actions.length && a.actions.every((t, i) => t === b.actions[i]);
  trace.forEach((step, i) => {
    const prev = trace[i - 1];
    if (i % STRIDE === 0 || prev === undefined) keep.add(i);
    else if (legOf(step.label) !== legOf(prev.label)) keep.add(i);
    else if (step.winner !== prev.winner || !sameActions(step, prev)) keep.add(i);
    const next = trace[i + 1];
    if (next === undefined || legOf(step.label) !== legOf(next.label)) keep.add(i);
  });
  return [...keep].sort((a, b) => a - b).map((i) => trace[i]!);
}

function expectTraceMatches(actual: Trace, golden: Trace): void {
  expect(actual.length).toBe(golden.length);
  actual.forEach((step, i) => {
    const want = golden[i]!;
    const at = `step ${i} (${step.label})`;
    expect(step.label, `step ${i}`).toBe(want.label);
    expect(step.winner, at).toBe(want.winner);
    expect(step.actions, `${at} actions`).toEqual(want.actions);
    expect(step.follow, `${at} follow`).toEqual(want.follow);
    for (const name of EPOCH_NAMES) {
      expect(step.epochs[name], `${at} epoch ${name}`).toEqual(want.epochs[name]);
    }
    const rows: [string, readonly number[], readonly number[]][] = [
      ['displayed', step.displayed, want.displayed],
      ['register', step.register, want.register],
    ];
    for (const [name, got, exp] of rows) {
      expect(got.length, `${at} ${name}`).toBe(exp.length);
      // Both sides are rounded to DIGITS, so a match is exact; the message
      // names the step and field on the first mismatch.
      got.forEach((g, k) => expect(g, `${at} ${name}[${k}]`).toBe(exp[k]!));
    }
  });
}

describe('driver golden trace (byte bar for arbitration, epochs and actions)', () => {
  it('matches the recorded trace', () => {
    const trace = thin(runScript());
    if (process.env['DRIVER_GOLDEN_RECORD']) {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(trace)}\n`);
      return;
    }
    expectTraceMatches(trace, GOLDEN as Trace);
  });
});
