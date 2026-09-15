import { describe, it, expect } from 'vitest';
import { diskBrightness } from '../../../src/utils/math/diskBrightness';

describe('diskBrightness', () => {
  it('is faint but non-zero at r=1', () => {
    // exp(-1/0.5) = exp(-2) ≈ 0.135
    expect(diskBrightness(1.0)).toBeCloseTo(0.135, 2);
  });
});
