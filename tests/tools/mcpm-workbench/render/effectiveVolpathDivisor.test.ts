import { describe, expect, it } from 'vitest';
import {
  BOOST_DIVISOR,
  SETTLE_MS,
  effectiveVolpathDivisor,
} from '../../../../tools/mcpm-workbench/src/render/effectiveVolpathDivisor';

describe('effectiveVolpathDivisor', () => {
  it('boosts below the settle threshold', () => {
    expect(effectiveVolpathDivisor(2, SETTLE_MS - 1)).toBe(BOOST_DIVISOR);
  });

  it('has settled at the threshold itself', () => {
    expect(effectiveVolpathDivisor(2, SETTLE_MS)).toBe(2);
  });

  it('stays settled well above the threshold', () => {
    expect(effectiveVolpathDivisor(2, SETTLE_MS + 800)).toBe(2);
  });

  it('is a no-op once the user divisor already meets the boost floor', () => {
    expect(effectiveVolpathDivisor(BOOST_DIVISOR, 0)).toBe(BOOST_DIVISOR);
  });

  it('raises a divisor-1 user setting to the boost floor during motion', () => {
    expect(effectiveVolpathDivisor(1, 0)).toBe(BOOST_DIVISOR);
  });
});
