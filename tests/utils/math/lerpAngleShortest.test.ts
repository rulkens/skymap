import { describe, it, expect } from 'vitest';
import { lerpAngleShortest } from '../../../src/utils/math/lerpAngleShortest';

const TAU = Math.PI * 2;

describe('lerpAngleShortest', () => {
  it('returns a at t=0', () => {
    expect(lerpAngleShortest(1.0, 2.5, 0)).toBeCloseTo(1.0, 10);
  });

  it('returns b at t=1', () => {
    // The output may be `b` itself OR an equivalent angle (b + 2π·k).
    // We compare modulo 2π to allow for the implementation’s choice.
    const out = lerpAngleShortest(1.0, 2.5, 1);
    const diff = (((out - 2.5) % TAU) + TAU) % TAU;
    // Either ~0 or ~2π — both are valid representations of the same angle.
    expect(Math.min(diff, TAU - diff)).toBeLessThan(1e-10);
  });

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

  it('does NOT take the long way (sanity check)', () => {
    // From 0.1 to 6.2 (≈ TAU - 0.083): short delta is BACKWARD ≈ -0.183,
    // not forward ≈ +6.1. At t=0.5 we should land near 0.1 - 0.0917 ≈ 0.0083
    // (or its wrapped equivalent), nowhere near the long-way midpoint of 3.15.
    const out = lerpAngleShortest(0.1, 6.2, 0.5);
    const wrapped = ((out % TAU) + TAU) % TAU;
    // The long-way midpoint would be ~3.15. We must be far from it.
    expect(Math.abs(wrapped - Math.PI)).toBeGreaterThan(1.0);
  });

  it('handles equal angles (delta = 0)', () => {
    expect(lerpAngleShortest(1.5, 1.5, 0.5)).toBeCloseTo(1.5, 10);
  });
});
