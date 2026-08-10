/**
 * ismMapAzIndexForAngle wraps and buckets a world angle into an azimuth
 * bin. The one property with no other coverage is the seam: the wrap
 * formula's `+ 2*PI` re-addition rounds an input distinctly BELOW 2*PI back
 * up to exactly 2*PI in double precision, landing on bin 0 rather than the
 * last bin a naive `angle < 2*PI` model expects — see
 * sampleIsmMapOrientation.test.ts, which first caught this at the sampler
 * level.
 */
import { describe, it, expect } from 'vitest';

import { ismMapAzIndexForAngle } from '../../../src/utils/galaxy/ismMapAzIndexForAngle';

describe('ismMapAzIndexForAngle', () => {
  const AZ = 4;

  it('buckets a mid-bin angle into its own bin', () => {
    // Bin 2 of 4 spans [pi, 1.5*pi); its midpoint is 1.25*pi.
    expect(ismMapAzIndexForAngle(1.25 * Math.PI, AZ)).toBe(2);
  });

  it('lands a world angle just below 2*PI on bin 0, not the last bin', () => {
    const angle = 2 * Math.PI - 1e-15;
    expect(angle).not.toBe(2 * Math.PI); // a distinct float, not literally the wrap point
    expect(ismMapAzIndexForAngle(angle, AZ)).toBe(0);
  });

  it('wraps a negative angle into the last bin, not bin 0 or out of range', () => {
    expect(ismMapAzIndexForAngle(-0.1, AZ)).toBe(AZ - 1);
  });
});
