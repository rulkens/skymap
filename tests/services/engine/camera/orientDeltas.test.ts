/**
 * orientDeltas — driver-level: the record is fed by `runFrame` itself, once per
 * frame, from the pose the frame displayed. Poll-rate diffing is what this
 * replaces, so the test drives real frames rather than the record's API.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import {
  clearOrientPeaks,
  readOrientDeltas,
  watchOrientDeltas,
} from '../../../../src/services/engine/camera/orientDeltas';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { poseAtHR } from '../../../helpers/camera/poseAtHR';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';

const JUMP_RAD = 0.25;

describe('the camera debug delta record', () => {
  let unwatch: (() => void) | null = null;

  beforeEach(() => {
    clearOrientPeaks();
  });
  afterEach(() => {
    unwatch?.();
    unwatch = null;
  });

  it('reads a one-frame roll swing as that frame’s Δ, then holds it as the peak', () => {
    unwatch = watchOrientDeltas();
    const h = makeCameraSimHarness({ focusBody: null, bootHR: 10 });
    const earth = h.bodies.get('earth')!;
    const restPose = poseAtHR(earth, h.radiusM('earth'), 10);
    h.seedPose(absoluteArm(restPose));
    h.frame(2);
    clearOrientPeaks();
    expect(readOrientDeltas().roll.deltaRad).toBeCloseTo(0, 12);

    h.seedPose(absoluteArm({ ...restPose, roll: JUMP_RAD }));
    h.tick(1_000);
    const jumped = readOrientDeltas();
    expect(jumped.roll.deltaRad).toBeCloseTo(JUMP_RAD, 9);
    expect(jumped.roll.peakAbsRad).toBeCloseTo(JUMP_RAD, 9);
    expect(jumped.roll.peakAtMs).toBe(1_000);
    // The three rows are separately derived: a roll swing is not tilt motion.
    expect(jumped.tilt.deltaRad).toBeCloseTo(0, 9);

    // The whole point of the hold: at rest the Δ column reads 0 again, but the
    // spike that a 4 Hz poll would have missed is still on the row.
    h.tick(1_016);
    const held = readOrientDeltas();
    expect(held.roll.deltaRad).toBeCloseTo(0, 12);
    expect(held.roll.peakAbsRad).toBeCloseTo(JUMP_RAD, 9);

    clearOrientPeaks();
    expect(readOrientDeltas().roll.peakAbsRad).toBe(0);
    expect(readOrientDeltas().roll.peakAtMs).toBeNull();
  });

  it('records nothing while unwatched, and does not bill the closed period to the first frame back', () => {
    const h = makeCameraSimHarness({ focusBody: null, bootHR: 10 });
    const earth = h.bodies.get('earth')!;
    const restPose = poseAtHR(earth, h.radiusM('earth'), 10);
    h.seedPose(absoluteArm(restPose));
    const stop = watchOrientDeltas();
    h.frame(2);
    stop();

    // Panel closed, camera flying: nothing accumulates.
    h.seedPose(absoluteArm({ ...restPose, roll: JUMP_RAD }));
    h.tick(1_000);
    const unwatched = readOrientDeltas();
    expect(unwatched.roll.deltaRad).toBe(0);
    expect(unwatched.roll.peakAbsRad).toBe(0);

    // Re-opened: the radians flown while it was shut are not one frame's Δ.
    unwatch = watchOrientDeltas();
    h.tick(1_016);
    const remounted = readOrientDeltas();
    expect(remounted.roll.deltaRad).toBe(0);
    expect(remounted.roll.peakAbsRad).toBe(0);
  });

  it('reads a swing across the ±π seam as the short way round', () => {
    // Unwrapped, this pair reads as −6 rad in one frame: a spike that never
    // happened, and one that would then own the peak column for the session.
    unwatch = watchOrientDeltas();
    const h = makeCameraSimHarness({ focusBody: null, bootHR: 10 });
    const restPose = poseAtHR(h.bodies.get('earth')!, h.radiusM('earth'), 10);
    h.seedPose(absoluteArm({ ...restPose, roll: 3 }));
    h.frame(2);
    h.seedPose(absoluteArm({ ...restPose, roll: -3 }));
    h.tick(1_000);

    expect(readOrientDeltas().roll.deltaRad).toBeCloseTo(2 * Math.PI - 6, 9);
  });
});
