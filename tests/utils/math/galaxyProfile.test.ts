import { describe, it, expect } from 'vitest';
import {
  bulgeBrightness,
  diskBrightness,
  combinedBrightness,
} from '../../../src/utils/math/galaxyProfile';

describe('galaxyProfile', () => {
  describe('bulgeBrightness', () => {
    it('peaks at the centre (r=0)', () => {
      expect(bulgeBrightness(0)).toBeCloseTo(1.0, 6);
    });
    it('decays as Gaussian: half-power at r ≈ 0.5 with default scale', () => {
      // Default bulge scale = 0.4 (40% of disk radius).
      // exp(-(0.5)² / (2·0.4²)) = exp(-0.25/0.32) ≈ exp(-0.78) ≈ 0.46
      expect(bulgeBrightness(0.5)).toBeCloseTo(0.458, 2);
    });
    it('is essentially zero at the disk edge (r=1)', () => {
      expect(bulgeBrightness(1.0)).toBeLessThan(0.05);
    });
  });

  describe('diskBrightness', () => {
    it('peaks at the centre (r=0)', () => {
      expect(diskBrightness(0)).toBeCloseTo(1.0, 6);
    });
    it('exponential falloff: 1/e at r = scaleRadius (default 0.5)', () => {
      expect(diskBrightness(0.5)).toBeCloseTo(Math.exp(-1), 3);
    });
    it('is faint but non-zero at r=1', () => {
      // exp(-1/0.5) = exp(-2) ≈ 0.135
      expect(diskBrightness(1.0)).toBeCloseTo(0.135, 2);
    });
  });

  describe('combinedBrightness', () => {
    it('returns bulge·bulgeWeight + disk·diskWeight', () => {
      // At r=0 both peaks contribute their full weight.
      const c = combinedBrightness(0, 0.6, 0.4);
      expect(c).toBeCloseTo(1.0, 6); // weights sum to 1; both peak at 1
    });
    it('weights mix correctly at intermediate radius', () => {
      // r=0.5: bulge ≈ 0.458, disk = 1/e ≈ 0.368
      const c = combinedBrightness(0.5, 0.6, 0.4);
      expect(c).toBeCloseTo(0.458 * 0.6 + 0.368 * 0.4, 2);
    });
    it('is non-negative everywhere', () => {
      for (let r = 0; r <= 2; r += 0.1) {
        expect(combinedBrightness(r, 0.6, 0.4)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
