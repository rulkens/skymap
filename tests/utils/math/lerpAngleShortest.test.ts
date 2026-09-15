import { describe, it, expect } from 'vitest';
import { lerpAngleShortest } from '../../../src/utils/math/lerpAngleShortest';

const TAU = Math.PI * 2;

describe('lerpAngleShortest', () => {
  it('takes the short arc across the 2π boundary', () => {
    // From 6.0 (≈ just below 2π) to 0.3 — the SHORT path is forward by ~0.6,
    // not backward by ~5.7. So at t=0.5 we expect to be near (6.0 + 0.3)/2 = 3.15
    // wrapped... actually: short forward delta = 0.3 + (TAU - 6.0) ≈ 0.5832.
    // At t=0.5 the result is 6.0 + 0.5832/2 = 6.2916, which mod 2π is 0.0084.
    const out = lerpAngleShortest(6.0, 0.3, 0.5);
    const wrapped = ((out % TAU) + TAU) % TAU;
    // Compare to the expected short-arc midpoint (≈ 0.0084 rad).
    const expectedShort = 0.5 * (0.3 + (TAU - 6.0));
    const expected = (6.0 + expectedShort) % TAU;
    expect(Math.abs(wrapped - expected)).toBeLessThan(1e-6);
  });

  it('handles equal angles (delta = 0)', () => {
    expect(lerpAngleShortest(1.5, 1.5, 0.5)).toBeCloseTo(1.5, 10);
  });
});
