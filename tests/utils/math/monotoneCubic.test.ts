/**
 * monotoneCubic — unit tests for the Fritsch–Carlson monotone cubic Hermite
 * interpolant used as the `flyPath` timing curve (time → arc-fraction).
 *
 * The timing curve maps real elapsed time to normalised progress along the
 * path. Two properties are load-bearing:
 *
 *   - It passes through every knot — so the camera is exactly AT waypoint i at
 *     that waypoint's scheduled time.
 *   - It is monotone (never decreasing) — so the camera never drifts BACKWARD
 *     along the path between knots, which a plain (Catmull-Rom-style) cubic can
 *     do when the knot slopes overshoot. Backward camera motion reads as a bug.
 */

import { describe, it, expect } from 'vitest';
import { monotoneCubic } from '../../../src/utils/math/monotoneCubic';

describe('monotoneCubic', () => {
  it('interpolates every knot exactly', () => {
    const f = monotoneCubic([0, 1, 2], [0, 0.5, 1]);
    expect(f(0)).toBeCloseTo(0, 12);
    expect(f(1)).toBeCloseTo(0.5, 12);
    expect(f(2)).toBeCloseTo(1, 12);
  });

  it('never decreases, even for a steep-then-flat profile that overshoots a naive cubic', () => {
    const f = monotoneCubic([0, 1, 2, 3], [0, 0.8, 0.9, 1]);
    let prev = -Infinity;
    for (let i = 0; i <= 300; i++) {
      const y = f((i / 300) * 3);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('stays within the knot value range (no overshoot above the last value)', () => {
    const f = monotoneCubic([0, 1, 2, 3], [0, 0.8, 0.9, 1]);
    for (let i = 0; i <= 300; i++) {
      const y = f((i / 300) * 3);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('clamps to the endpoints outside the knot range', () => {
    const f = monotoneCubic([0, 2], [0, 1]);
    expect(f(-5)).toBeCloseTo(0, 12);
    expect(f(99)).toBeCloseTo(1, 12);
  });

  it('reduces to linear interpolation for collinear knots', () => {
    const f = monotoneCubic([0, 1, 2], [0, 1, 2]);
    expect(f(0.5)).toBeCloseTo(0.5, 9);
    expect(f(1.5)).toBeCloseTo(1.5, 9);
  });
});
