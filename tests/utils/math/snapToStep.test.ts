import { describe, expect, it } from 'vitest';
import { snapToStep } from '../../../src/utils/math/snapToStep';

describe('snapToStep', () => {
  it('snaps to the grid measured from min, not from zero', () => {
    // 64 + round(1170 / 64) * 64 = 64 + 18 * 64
    expect(snapToStep(1234, 64, 4096, 64)).toBe(1216);
    expect(snapToStep(0.37, 0.01, 4, 0.05)).toBe(0.36);
  });

  it('strips binary-float dust to the step decimals', () => {
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
  });

  it('keeps a snapped value that rounds past max inside the range', () => {
    // round(9.4 / 2) * 2 = 10, beyond max 9.5
    expect(snapToStep(9.4, 0, 9.5, 2)).toBe(9.5);
  });
});
