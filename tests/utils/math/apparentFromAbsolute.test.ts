import { describe, it, expect } from 'vitest';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import { apparentFromAbsolute } from '../../../src/utils/math/apparentFromAbsolute';

describe('apparentFromAbsolute', () => {
  it('round-trips with absoluteFromApparent: apparent → absolute → apparent', () => {
    const m0 = 14.5;
    const d = 350;
    const M = absoluteFromApparent(m0, d);
    expect(apparentFromAbsolute(M, d)).toBeCloseTo(m0, 6);
  });
  it('returns NaN for non-positive distance', () => {
    expect(apparentFromAbsolute(-18, 0)).toBeNaN();
    expect(apparentFromAbsolute(-18, -5)).toBeNaN();
  });
});
