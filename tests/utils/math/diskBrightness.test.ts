import { describe, it, expect } from 'vitest';
import { diskBrightness } from '../../../src/utils/math/diskBrightness';

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
