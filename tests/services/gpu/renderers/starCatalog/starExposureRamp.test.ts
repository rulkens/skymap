/**
 * starExposureRamp — the scale-dependent display-exposure ramp for the survey
 * starfield. The behaviours pinned here are the ramp's contract: clamped to the
 * near baseline below the near anchor, clamped to the far scale above the far
 * anchor, geometric (log-log linear) between so the log-distance midpoint is the
 * geometric mean of the anchor scales, monotone non-decreasing throughout, and a
 * non-positive distance treated as the near case (guarding log₁₀(0) = -∞).
 */

import { describe, it, expect } from 'vitest';

import {
  starExposureRamp,
  RAMP_NEAR_MPC,
  RAMP_FAR_MPC,
  RAMP_FAR_SCALE,
} from '../../../../../src/services/gpu/renderers/starCatalog/starExposureRamp';

describe('starExposureRamp', () => {
  it('holds at the near baseline (1) at and below the near anchor', () => {
    expect(starExposureRamp(RAMP_NEAR_MPC)).toBe(1.0);
    expect(starExposureRamp(RAMP_NEAR_MPC / 10)).toBe(1.0);
  });

  it('holds at the far scale at and above the far anchor', () => {
    expect(starExposureRamp(RAMP_FAR_MPC)).toBe(RAMP_FAR_SCALE);
    expect(starExposureRamp(RAMP_FAR_MPC * 10)).toBe(RAMP_FAR_SCALE);
  });

  it('returns the geometric-mean scale at the log-distance midpoint', () => {
    // The log-distance midpoint is the GEOMETRIC mean of the two anchor
    // distances; the ramp is log-log linear, so the returned scale there is the
    // GEOMETRIC mean of the anchor scales (near = 1, far = RAMP_FAR_SCALE), i.e.
    // √RAMP_FAR_SCALE — NOT the arithmetic (1 + RAMP_FAR_SCALE) / 2.
    const midDistMpc = Math.sqrt(RAMP_NEAR_MPC * RAMP_FAR_MPC);
    const geometricMeanScale = Math.sqrt(1.0 * RAMP_FAR_SCALE);
    expect(starExposureRamp(midDistMpc)).toBeCloseTo(geometricMeanScale, 12);
  });

  it('is monotone non-decreasing across the ramp', () => {
    // Sample log-uniformly from a decade below the near anchor to a decade above
    // the far anchor, spanning both clamps and the interpolated interior.
    const lo = Math.log10(RAMP_NEAR_MPC) - 1;
    const hi = Math.log10(RAMP_FAR_MPC) + 1;
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const d = 10 ** (lo + ((hi - lo) * i) / 100);
      const s = starExposureRamp(d);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('treats a zero or negative distance as the near case (returns 1)', () => {
    expect(starExposureRamp(0)).toBe(1.0);
    expect(starExposureRamp(-1)).toBe(1.0);
  });
});
