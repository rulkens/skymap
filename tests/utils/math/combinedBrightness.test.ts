import { describe, it, expect } from 'vitest';
import { combinedBrightness } from '../../../src/utils/math/combinedBrightness';

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
