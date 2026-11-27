import { describe, expect, it } from 'vitest';
import { effectiveVolpathDivisor } from '../../../src/render/effectiveVolpathDivisor';
import { SETTLE_MS } from '../../../src/render/settleMs.constant';
import { BOOST_DIVISOR } from '../../../src/render/boostDivisor.constant';

describe('effectiveVolpathDivisor', () => {
  it('boosts below the settle threshold', () => {
    expect(effectiveVolpathDivisor(2, SETTLE_MS - 1)).toBe(BOOST_DIVISOR);
  });

  it('has settled at the threshold itself', () => {
    expect(effectiveVolpathDivisor(2, SETTLE_MS)).toBe(2);
  });

  it('raises a divisor-1 user setting to the boost floor during motion', () => {
    expect(effectiveVolpathDivisor(1, 0)).toBe(BOOST_DIVISOR);
  });
});
