import { describe, it, expect } from 'vitest';
import { easeOutCubic } from '../../../src/utils/math/easeOutCubic';

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('decelerates: easeOutCubic(0.5) > 0.5 (past the midpoint already)', () => {
    // Cubic ease-out reaches 7/8 at t=0.5: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
  });

  it('clamps inputs above 1 to a sensible value (no overshoot)', () => {
    // Strict math gives 1 - (1 - 1.5)^3 = 1 - (-0.125) = 1.125, but we want
    // tween outputs to never overshoot the target. easeOutCubic must clamp.
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('clamps inputs below 0 to 0 (no rewind)', () => {
    expect(easeOutCubic(-0.2)).toBe(0);
  });
});
