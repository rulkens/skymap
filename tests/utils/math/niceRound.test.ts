import { describe, it, expect } from 'vitest';
import { niceRound } from '../../../src/utils/math/niceRound';

describe('niceRound', () => {
  it('returns 2 for 3.7 (mantissa 3.7 → 2)', () => {
    // Mantissa 3.7 falls into the [2, 5) bucket, so it rounds down to 2.
    expect(niceRound(3.7)).toBe(2);
  });

  it('returns 500 for 800 (mantissa 8 → 5 × 10²)', () => {
    // 800 = 8 × 10² → nice mantissa 5 → 500.
    expect(niceRound(800)).toBe(500);
  });

  it('returns 0 for 0 (degenerate input)', () => {
    // The function explicitly guards x ≤ 0 because Math.log10(0) is -∞.
    expect(niceRound(0)).toBe(0);
  });

  it('returns the value itself when it is already a nice power of ten', () => {
    // Powers of 10 (mantissa = 1) sit at the bucket boundary and pass through.
    expect(niceRound(100)).toBe(100);
  });
});
