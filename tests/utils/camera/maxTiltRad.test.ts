/**
 * maxTiltRad — the tilt ceiling that closes as the surface arm approaches
 * its disengage altitude and opens fully near the ground.  These tests pin
 * the two endpoints against the SURFACE_REGIME record (never a literal),
 * the documented crossing band, and monotonicity across the ramp.
 */

import { describe, it, expect } from 'vitest';
import { maxTiltRad } from '../../../src/utils/camera/maxTiltRad';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';

describe('maxTiltRad', () => {
  it('is 0 at the disengage altitude', () => {
    expect(maxTiltRad(SURFACE_REGIME.disengageHR)).toBe(0);
  });

  it('is pi at and below the tilt-full altitude', () => {
    expect(maxTiltRad(SURFACE_REGIME.tiltFullHR)).toBeCloseTo(Math.PI, 12);
    expect(maxTiltRad(SURFACE_REGIME.tiltFullHR / 2)).toBeCloseTo(Math.PI, 12);
    expect(maxTiltRad(0)).toBeCloseTo(Math.PI, 12);
  });

  it('crosses 90 degrees near the midpoint of the two edges (~1.71 R)', () => {
    const atMidpoint = maxTiltRad((SURFACE_REGIME.disengageHR + SURFACE_REGIME.tiltFullHR) / 2);
    expect(atMidpoint).toBeCloseTo(Math.PI / 2, 12);

    // Loosely locate the 90 degree crossing itself, without pinning an exact
    // h/R — a feel-gate tweak to tiltFullHR must not turn this into a tollbooth.
    const samples: number[] = [];
    for (let hOverR = 1.6; hOverR <= 1.8; hOverR += 0.01) {
      samples.push(hOverR);
    }
    const crossing = samples.find((hOverR) => maxTiltRad(hOverR) <= Math.PI / 2);
    expect(crossing).toBeGreaterThan(1.6);
    expect(crossing).toBeLessThan(1.8);
  });

  it('is monotonically non-increasing in h/R', () => {
    let previous = maxTiltRad(0);
    for (let hOverR = 0; hOverR <= 4; hOverR += 0.05) {
      const current = maxTiltRad(hOverR);
      expect(current).toBeLessThanOrEqual(previous + 1e-12);
      previous = current;
    }
  });
});
