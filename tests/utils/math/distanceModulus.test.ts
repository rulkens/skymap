import { describe, it, expect } from 'vitest';
import { absoluteFromApparent, apparentFromAbsolute } from '../../../src/utils/math/distanceModulus';

describe('distanceModulus', () => {
  it('apparent 17, distance 100 Mpc → absolute −18.0', () => {
    // M = m − 5·log10(d_Mpc·1e6/10) = 17 − 5·log10(1e7) = 17 − 35 = −18
    expect(absoluteFromApparent(17, 100)).toBeCloseTo(-18.0, 2);
  });
  it('round-trip: apparent → absolute → apparent', () => {
    const m0 = 14.5;
    const d = 350;
    const M = absoluteFromApparent(m0, d);
    expect(apparentFromAbsolute(M, d)).toBeCloseTo(m0, 6);
  });
  it('returns NaN for non-positive distance', () => {
    expect(absoluteFromApparent(17, 0)).toBeNaN();
    expect(absoluteFromApparent(17, -5)).toBeNaN();
  });
});
