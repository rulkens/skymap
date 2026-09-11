/**
 * clampCameraTuning — the cross-edge policy: which knob yields to which, and
 * the one cap that outranks the caller. Expected values are hand-computed off
 * `minRatio` = 1.1; range clamps are not tested (boundary restatements).
 */

import { describe, it, expect } from 'vitest';

import { clampCameraTuning } from '../../../src/utils/camera/clampCameraTuning';
import { DEFAULT_CAMERA_TUNING } from '../../../src/data/camera/cameraTuning';

describe('clampCameraTuning', () => {
  it('leaves the shipped defaults untouched', () => {
    // The invariant the deleted load-time `throw` in `bodyUpWeight` asserted:
    // the shipped tilt-zero edge is already at or under the disengage edge.
    expect(clampCameraTuning({}, DEFAULT_CAMERA_TUNING)).toEqual(DEFAULT_CAMERA_TUNING);
  });

  it('raises disengage when engage is pushed into it', () => {
    const next = clampCameraTuning({ engageHR: 2 }, DEFAULT_CAMERA_TUNING);
    expect(next.engageHR).toBe(2);
    expect(next.disengageHR).toBeCloseTo(2.2, 12);
  });

  it('lowers engage — and drags tilt-zero down — when disengage is pulled under it', () => {
    const next = clampCameraTuning({ disengageHR: 0.22 }, DEFAULT_CAMERA_TUNING);
    expect(next.disengageHR).toBe(0.22);
    expect(next.engageHR).toBeCloseTo(0.2, 12);
    // The arm now flips at 0.22, so the blend has to reach scene up by then.
    expect(next.tiltZeroHR).toBe(0.22);
  });

  it('raises tilt-zero when tilt-full is pushed into it, while the cap allows', () => {
    const next = clampCameraTuning({ tiltFullHR: 0.6 }, DEFAULT_CAMERA_TUNING);
    expect(next.tiltFullHR).toBe(0.6);
    expect(next.tiltZeroHR).toBeCloseTo(0.66, 12);
  });

  it('lowers tilt-full when tilt-zero is pulled under it', () => {
    const next = clampCameraTuning({ tiltZeroHR: 0.05 }, DEFAULT_CAMERA_TUNING);
    expect(next.tiltZeroHR).toBe(0.05);
    expect(next.tiltFullHR).toBeCloseTo(0.045454545454545456, 12);
  });

  it('makes the disengage cap outrank a tilt-full patch', () => {
    // 0.85 × 1.1 = 0.935 would need a tilt-zero above disengage (0.9), so the
    // caller's own knob yields instead — the one asymmetry between the pairs.
    const next = clampCameraTuning({ tiltFullHR: 0.85 }, DEFAULT_CAMERA_TUNING);
    expect(next.tiltZeroHR).toBe(0.6);
    expect(next.tiltFullHR).toBeCloseTo(0.5454545454545454, 12);
  });
});
