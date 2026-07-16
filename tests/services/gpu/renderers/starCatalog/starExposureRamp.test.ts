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
  SHADER_BAKED_NEAR_EXPOSURE,
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

  describe('live-tunable anchors', () => {
    it('scales the near-end multiplier by nearX / SHADER_BAKED_NEAR_EXPOSURE', () => {
      // The shader bakes SHADER_BAKED_NEAR_EXPOSURE (15) into STAR_FLUX_EXPOSURE,
      // so the CPU ramp's near end is nearX relative to that baked constant:
      // nearX = 30 (double the baked 15) doubles the near-end multiplier from the
      // default 1.0 to 2.0.
      const nearX = 2 * SHADER_BAKED_NEAR_EXPOSURE;
      expect(starExposureRamp(RAMP_NEAR_MPC, nearX, 70)).toBeCloseTo(2.0, 12);
      expect(starExposureRamp(RAMP_NEAR_MPC / 10, nearX, 70)).toBeCloseTo(2.0, 12);
    });

    it('changes only the far end when farX moves and nearX stays at the default', () => {
      // farX only sets the far-anchor multiplier; the near clamp is untouched.
      expect(starExposureRamp(RAMP_NEAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 300)).toBe(1.0);
      // At/beyond the far anchor the multiplier is farX / baked-near, so a farX
      // of 150 (10× the baked 15) reads back 10.
      expect(starExposureRamp(RAMP_FAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 150)).toBeCloseTo(10, 12);
      expect(starExposureRamp(RAMP_FAR_MPC * 10, SHADER_BAKED_NEAR_EXPOSURE, 150)).toBeCloseTo(
        10,
        12,
      );
    });

    it('reproduces the fixed ramp exactly when both anchors are left at the defaults', () => {
      // The explicit (15, 70) call must match the default-argument call, which is
      // the regression guard pinned by the tests above (near = 1, far = 70/15).
      const explicit = starExposureRamp(RAMP_FAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 70);
      expect(explicit).toBe(RAMP_FAR_SCALE);
      expect(explicit).toBe(starExposureRamp(RAMP_FAR_MPC));
    });
  });
});
