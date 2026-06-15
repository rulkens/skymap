import { describe, it, expect } from 'vitest';
import { dMaxFromAbsolute } from '../../../src/utils/math/dMaxFromAbsolute';
import { apparentFromAbsolute } from '../../../src/utils/math/apparentFromAbsolute';

describe('dMaxFromAbsolute', () => {
  it('inverts apparentFromAbsolute: a galaxy at d_max hits exactly m_lim', () => {
    // d_max is the distance at which M reaches the flux limit; placing the
    // galaxy there and computing apparent magnitude must return m_lim.
    const M = -20;
    const mLim = 17.77;
    const dMax = dMaxFromAbsolute(M, mLim);
    expect(apparentFromAbsolute(M, dMax)).toBeCloseTo(mLim, 6);
  });
  it('brighter galaxies (more negative M) are detectable to larger distances', () => {
    const mLim = 17.77;
    expect(dMaxFromAbsolute(-22, mLim)).toBeGreaterThan(dMaxFromAbsolute(-18, mLim));
  });
});
