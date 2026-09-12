/**
 * engagedArmClock — spec §14's "Clock" invariant, verified as an EQUALITY, not
 * a tolerance: a body-fixed pose stores no epoch (poseFrameConversion's header),
 * so nothing on the engaged path reads a world position and racing the sim
 * clock alone — no gesture, no driver — must never move it, however fast.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The harness's `state.settings`/`state.gpu` slices are minimal (camera-only);
// these three run inside `runFrame` regardless and reach past what the
// fixture stubs, same as every other camera-only frame-level fixture.
vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

// A crossing frame's SAME-simDays pre-flip world (arg 2) vs its post-flip
// displayed pose (arg 3) is the only continuity comparison an accelerated
// clock cannot contaminate with legitimate orbital motion between frames —
// so the probe records both, per frame, like `poseFold.test.ts`'s.
const probe = vi.hoisted(() => ({
  worldPose: [] as unknown[],
  renderPose: [] as unknown[],
}));
vi.mock('../../../../src/services/engine/frame/frameContext', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/frame/frameContext')>();
  return {
    ...actual,
    deriveFrameContext: (...args: Parameters<typeof actual.deriveFrameContext>) => {
      probe.worldPose.push(args[2]);
      probe.renderPose.push(args[3]);
      return actual.deriveFrameContext(...args);
    },
  };
});

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { poseAtHR } from '../../../helpers/camera/poseAtHR';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { setRate, resume } from '../../../../src/state/time/timeSlice';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { RATE_LADDER } from '../../../../src/data/time/rateLadder';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const EARTH: BodyState = deriveBodyStates(CONST_J2000).get('earth')!;
const EARTH_ARM = { body: 'earth' as BodyId };
// The ladder's fastest detent, ~3.16e8 s/s — three decades past the spec's
// literal 10^6x, so a Clock leak this size cannot hide inside float noise.
const FASTEST_RATE_INDEX = RATE_LADDER.length - 1;

/** Earth-focused body arm at h/R 0.1 (inside `engageHR`); one frame folds the
 * boot absolute-arm pose into it — no focus, so nothing else drives the pose. */
function makeEngagedHarness() {
  const h = makeCameraSimHarness({ focusBody: null, bootHR: 0.1 });
  h.tick(0);
  expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');
  return h;
}

/** Unpause (the harness boots paused) and pin the clock to its fastest detent. */
function raceClock(h: ReturnType<typeof makeCameraSimHarness>, nowMs: number): void {
  h.store.dispatch(resume({ nowMs }));
  h.store.dispatch(setRate({ rateIndex: FASTEST_RATE_INDEX, nowMs }));
}

function bodyFixedPose(h: ReturnType<typeof makeCameraSimHarness>): BodyFixedPose {
  const framed = h.state.cameraRuntime.register.pose;
  if (framed.frame === 'absolute') throw new Error('expected an engaged body arm');
  return framed.pose;
}

describe('engaged-arm clock invariance (spec §14)', () => {
  beforeEach(() => {
    probe.worldPose.length = 0;
    probe.renderPose.length = 0;
  });

  it('the tracked ground point is bit-identical across frames under a 10⁶× clock', () => {
    const h = makeEngagedHarness();
    raceClock(h, 0);
    const groundPoint = bodyFixedPose(h).eyeRelAnchorM;
    const simDaysBefore = h.state.cameraRuntime.outputs.simDays;

    h.frame(5);

    // Sanity: the clock actually raced, or the rest of this test is vacuous.
    expect(h.state.cameraRuntime.outputs.simDays).not.toBe(simDaysBefore);
    expect(bodyFixedPose(h).eyeRelAnchorM).toEqual(groundPoint);
  });

  it('the engaged pose is unchanged by advancing the clock alone', () => {
    const h = makeEngagedHarness();
    raceClock(h, 0);
    const baselineRegister = h.state.cameraRuntime.register.pose;
    const baselineDisplayed = h.state.cameraRuntime.outputs.displayed;
    const simDaysAtBaseline = h.state.cameraRuntime.outputs.simDays;

    for (let i = 0; i < 20; i += 1) {
      h.frame(1);
      // No gesture, no driver: 'resting' never yields to another driver, and
      // its pose is `camera.base` verbatim — checked every frame so a slow
      // per-frame drift cannot hide between two widely-spaced samples.
      expect(h.state.cameraRuntime.register.winner).toBe('resting');
      expect(h.state.cameraRuntime.register.pose).toEqual(baselineRegister);
      expect(h.state.cameraRuntime.outputs.displayed).toEqual(baselineDisplayed);
    }
    expect(h.state.cameraRuntime.outputs.simDays).not.toBe(simDaysAtBaseline);
  });

  it('crossing out of the arm under an accelerated clock does not snap the image', () => {
    // H1: seeded already engaged, just inside `disengageHR` (0.4); a steady
    // per-frame zoom-out notch crosses it a few frames in, clock racing
    // underneath throughout (Earth moves ~a month per frame at this rate).
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    const NEAR_EDGE = poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.35);
    const armed = {
      frame: EARTH_ARM,
      pose: toBodyArm(NEAR_EDGE, B, B, EARTH_ARM.body, EARTH),
    } as const;
    h.store.dispatch(commitCameraPose(armed));
    h.state.cameraRuntime = {
      ...h.state.cameraRuntime,
      register: { ...h.state.cameraRuntime.register, pose: armed },
    };
    raceClock(h, 0);

    let nowMs = 0;
    let crossing = -1;
    for (let i = 0; i < 200 && crossing < 0; i += 1) {
      h.push({ kind: 'wheel', deltaY: 60, duringGesture: false, xPx: 50, yPx: 50 });
      h.tick(nowMs);
      nowMs += 16;
      if ((probe.renderPose[i] as FramedCameraPose).frame === 'absolute') crossing = i;
    }

    expect(crossing).toBeGreaterThan(-1);
    // Both eyes come from THIS ONE frame's probe entries — the pre-flip world
    // (arg 2, the old arm resolved off the frame's own bodyState) and the
    // post-flip displayed pose (arg 3) — so a racing clock cannot leak a
    // legitimate orbital shift into the comparison; only the flip itself can.
    // Bound: poseFold's crossing tests hold the same conversion to ~5e-5 m at
    // the same heliocentric magnitude with the clock frozen; a clock-dependent
    // leak here would be decades above it at any clock speed.
    const preFlipEye = eyeMpcOf(probe.worldPose[crossing] as CameraPose, B);
    const postFlip = probe.renderPose[crossing] as FramedCameraPose;
    if (postFlip.frame !== 'absolute') throw new Error('unreachable: crossing index mismatch');
    const postFlipEye = eyeMpcOf(postFlip.pose, B);
    for (let k = 0; k < 3; k += 1) {
      const driftM = Math.abs(postFlipEye[k]! - preFlipEye[k]!) * SCALE_UNITS.MPC_TO_M;
      expect(driftM).toBeLessThan(5e-5);
    }
  });
});
