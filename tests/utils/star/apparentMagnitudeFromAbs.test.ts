import { describe, expect, it } from 'vitest';

import { apparentMagnitudeFromAbs } from '../../../src/utils/star/apparentMagnitudeFromAbs';

// The distance modulus is m − M = 5·log₁₀(d/10pc). These assertions use
// hand-computed reference values at distances where log₁₀ is an integer, so a
// wrong sign, wrong factor, or wrong zero-point in the implementation would
// change the answer — they are not the source formula re-run.
describe('apparentMagnitudeFromAbs', () => {
  it('is the absolute magnitude at 10 pc', () => {
    // 10 pc is the definition point of absolute magnitude: the distance
    // modulus is exactly 0, so apparent === absolute.
    expect(apparentMagnitudeFromAbs(5, 10)).toBe(5);
  });

  it('dims by 5 mag per decade', () => {
    // At 100 pc the star is one decade (×10) further than the 10 pc
    // reference, so it appears 5·log₁₀(10) = 5 magnitudes fainter: 5 + 5 = 10.
    expect(apparentMagnitudeFromAbs(5, 100)).toBe(10);
  });
});
