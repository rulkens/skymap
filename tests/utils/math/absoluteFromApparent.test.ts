import { describe, it, expect } from 'vitest';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';

describe('absoluteFromApparent', () => {
  it('apparent 17, distance 100 Mpc → absolute −18.0', () => {
    // M = m − 5·log10(d_Mpc·1e6/10) = 17 − 5·log10(1e7) = 17 − 35 = −18
    expect(absoluteFromApparent(17, 100)).toBeCloseTo(-18.0, 2);
  });
  it('returns NaN for non-positive distance', () => {
    expect(absoluteFromApparent(17, 0)).toBeNaN();
    expect(absoluteFromApparent(17, -5)).toBeNaN();
  });
});
