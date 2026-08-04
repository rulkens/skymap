/**
 * starExposureRamp — the scale-dependent display-exposure ramp for the survey
 * starfield, now a THREE-anchor piecewise log-linear curve (near / mid / far).
 * The behaviours pinned here are the ramp's contract: clamped to the near
 * baseline below the near anchor and to the far scale above the far anchor,
 * geometric (log-log linear) WITHIN each segment so a segment's log-midpoint is
 * the geometric mean of its anchor scales, passing exactly through the mid
 * anchor, monotone across the defaults, and a non-positive distance treated as
 * the near case (guarding log₁₀(0) = -∞).
 *
 * The load-bearing fact: a piecewise curve through three points that all LIE ON
 * the old two-point (near→far) curve is IDENTICAL to that old curve — so the
 * default `midX` (chosen ON that continuation) reproduces the previous look, and
 * only pulling `midX` off it bends the middle. The `oldTwoPoint` reference below
 * is the pre-mid-anchor curve, recomputed here to pin both claims.
 */

import { describe, it, expect } from 'vitest';

import {
  starExposureRamp,
  RAMP_NEAR_MPC,
  RAMP_MID_MPC,
  RAMP_FAR_MPC,
  RAMP_FAR_SCALE,
  SHADER_BAKED_NEAR_EXPOSURE,
} from '../../../../../src/services/gpu/renderers/starCatalog/starExposureRamp';

// The pre-mid-anchor two-point ramp, recomputed as the regression reference:
// a single geometric interpolation from `nearX/6` to `farX/6` across the whole
// [near, far] log-distance band.
function oldTwoPoint(distMpc: number, nearX = SHADER_BAKED_NEAR_EXPOSURE, farX = 28): number {
  const nearScale = nearX / SHADER_BAKED_NEAR_EXPOSURE;
  if (distMpc <= RAMP_NEAR_MPC) return nearScale;
  if (distMpc >= RAMP_FAR_MPC) return farX / SHADER_BAKED_NEAR_EXPOSURE;
  const t =
    (Math.log10(distMpc) - Math.log10(RAMP_NEAR_MPC)) /
    (Math.log10(RAMP_FAR_MPC) - Math.log10(RAMP_NEAR_MPC));
  return nearScale * (farX / nearX) ** t;
}

describe('starExposureRamp', () => {
  it('holds at the near baseline (1) at and below the near anchor', () => {
    expect(starExposureRamp(RAMP_NEAR_MPC)).toBe(1.0);
    expect(starExposureRamp(RAMP_NEAR_MPC / 10)).toBe(1.0);
  });

  it('holds at the far scale at and above the far anchor', () => {
    expect(starExposureRamp(RAMP_FAR_MPC)).toBe(RAMP_FAR_SCALE);
    expect(starExposureRamp(RAMP_FAR_MPC * 10)).toBe(RAMP_FAR_SCALE);
  });

  it('passes exactly through the mid anchor scale at the mid-anchor distance', () => {
    // At the 3 kpc knot the curve returns the mid anchor's own multiplier
    // (`midX / SHADER_BAKED_NEAR_EXPOSURE`) — a boundary the two segments must
    // agree on. A segment-math bug that mis-joins the near→mid and mid→far pieces
    // would miss this.
    const midX = 45;
    expect(starExposureRamp(RAMP_MID_MPC, SHADER_BAKED_NEAR_EXPOSURE, midX, 70)).toBeCloseTo(
      midX / SHADER_BAKED_NEAR_EXPOSURE,
      12,
    );
  });

  it('returns a segment geometric mean at that segment’s log-distance midpoint', () => {
    // The near→mid segment: its log-distance midpoint is the GEOMETRIC mean of
    // the near and mid anchor distances, and — the curve being log-log linear
    // within the segment — the scale there is the geometric mean of the near
    // scale (1) and the mid scale (midX / 6), NOT their arithmetic mean.
    const midX = 45;
    const segMidDistMpc = Math.sqrt(RAMP_NEAR_MPC * RAMP_MID_MPC);
    const geometricMeanScale = Math.sqrt(1.0 * (midX / SHADER_BAKED_NEAR_EXPOSURE));
    expect(starExposureRamp(segMidDistMpc, SHADER_BAKED_NEAR_EXPOSURE, midX, 70)).toBeCloseTo(
      geometricMeanScale,
      12,
    );
  });

  it('is monotone non-decreasing across the ramp at the defaults', () => {
    // Defaults are 6 / 23 / 28 (near < mid < far), so the whole curve rises.
    // Sample log-uniformly from a decade below near to a decade above far,
    // spanning both clamps and both interpolated segments.
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

  describe('the three-points-on-the-old-line identity', () => {
    it('is bit-identical to the old two-point curve when the mid anchor sits ON it', () => {
      // Choose midX as the old curve's own exposure at the 3 kpc knot: the third
      // point then lies on the old straight line, so adding it can't bend the
      // curve. The three-anchor ramp must reproduce the old two-point curve at
      // every distance — the property that makes a mid anchor a safe extension.
      const midOnLine = oldTwoPoint(RAMP_MID_MPC) * SHADER_BAKED_NEAR_EXPOSURE;
      const lo = Math.log10(RAMP_NEAR_MPC) - 1;
      const hi = Math.log10(RAMP_FAR_MPC) + 1;
      for (let i = 0; i <= 200; i++) {
        const d = 10 ** (lo + ((hi - lo) * i) / 200);
        expect(starExposureRamp(d, SHADER_BAKED_NEAR_EXPOSURE, midOnLine, 28)).toBeCloseTo(
          oldTwoPoint(d),
          12,
        );
      }
    });

    it('reproduces the old look at the shipped defaults (visually indistinguishable)', () => {
      // The default midX (23) is the old value at 3 kpc rounded to a whole
      // number, so the default curve tracks the old two-point curve to within a
      // hair everywhere — the ramp brings a new lever, not a new look.
      const lo = Math.log10(RAMP_NEAR_MPC) - 1;
      const hi = Math.log10(RAMP_FAR_MPC) + 1;
      for (let i = 0; i <= 200; i++) {
        const d = 10 ** (lo + ((hi - lo) * i) / 200);
        expect(Math.abs(starExposureRamp(d) - oldTwoPoint(d))).toBeLessThan(0.02);
      }
    });
  });

  describe('the mid anchor is an independent middle lever', () => {
    it('dips the 3 kpc value without moving the near or far endpoints', () => {
      // Pull midX below its default: the mid-anchor value drops, but the near
      // clamp (1) and far clamp (farX/6) are untouched — the whole point of the
      // third anchor is a middle bend that leaves both ends fixed.
      const lowered = starExposureRamp(RAMP_MID_MPC, SHADER_BAKED_NEAR_EXPOSURE, 30, 28);
      const defaulted = starExposureRamp(RAMP_MID_MPC, SHADER_BAKED_NEAR_EXPOSURE, 57, 28);
      expect(lowered).toBeLessThan(defaulted);
      expect(lowered).toBeCloseTo(30 / SHADER_BAKED_NEAR_EXPOSURE, 12);

      expect(starExposureRamp(RAMP_NEAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 30, 28)).toBe(1.0);
      expect(starExposureRamp(RAMP_FAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 30, 28)).toBe(
        RAMP_FAR_SCALE,
      );
    });
  });

  describe('live-tunable anchors', () => {
    it('scales the near-end multiplier by nearX / SHADER_BAKED_NEAR_EXPOSURE', () => {
      // nearX = 12 (double the baked 6) doubles the near-end multiplier from the
      // default 1.0 to 2.0; the mid/far anchors don't touch the near clamp.
      const nearX = 2 * SHADER_BAKED_NEAR_EXPOSURE;
      expect(starExposureRamp(RAMP_NEAR_MPC, nearX, 57, 70)).toBeCloseTo(2.0, 12);
      expect(starExposureRamp(RAMP_NEAR_MPC / 10, nearX, 57, 70)).toBeCloseTo(2.0, 12);
    });

    it('reads the far end back as farX / SHADER_BAKED_NEAR_EXPOSURE', () => {
      // A farX of 60 (10× the baked 6) reads back 10 at/beyond the far anchor,
      // independent of nearX / midX.
      expect(starExposureRamp(RAMP_FAR_MPC, SHADER_BAKED_NEAR_EXPOSURE, 57, 60)).toBeCloseTo(
        10,
        12,
      );
      expect(starExposureRamp(RAMP_FAR_MPC * 10, SHADER_BAKED_NEAR_EXPOSURE, 57, 60)).toBeCloseTo(
        10,
        12,
      );
    });
  });
});
