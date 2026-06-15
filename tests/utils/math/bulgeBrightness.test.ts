import { describe, it, expect } from 'vitest';
import { bulgeBrightness } from '../../../src/utils/math/bulgeBrightness';

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
