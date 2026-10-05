import { describe, expect, it } from 'vitest';

import { trueReliefNormalGain } from '../../../../tools/utils/image/trueReliefNormalGain';

describe('trueReliefNormalGain', () => {
  it('is the height range over the equatorial texel size, both in km', () => {
    // 1000 km radius, 2*pi*1000 km around, 628 texels: ~10.005 km per texel.
    const texelKm = (2 * Math.PI * 1000) / 628;
    expect(trueReliefNormalGain(20, 1_000_000, 628)).toBeCloseTo(20 / texelKm, 10);
  });
});
