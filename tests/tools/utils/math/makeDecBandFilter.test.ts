import { describe, it, expect } from 'vitest';
import { makeDecBandFilter } from '../../../../tools/utils/math/makeDecBandFilter';

/**
 * `makeDecBandFilter` builds a declination-band predicate: a row is inside when
 * its Dec is within `halfThicknessDeg` of `decCenterDeg` AND its RA is in
 * `[raMinDeg, raMaxDeg]`. Pure interval comparisons, no trig, no RA wraparound
 * (the spans it's used for don't cross the 0°/360° seam).
 *
 * Parameters mirror the DESI wedge patch: center Dec 30.65° ± 1.25° (a band
 * 29.4°–31.9°) over RA 205°–270°.
 */
describe('makeDecBandFilter', () => {
  const isInBand = makeDecBandFilter(30.65, 1.25, 205, 270);

  it('rejects points past the lower and upper Dec edges', () => {
    // Just inside each Dec edge stays in; just outside drops.
    expect(isInBand(237, 29.4)).toBe(true);
    expect(isInBand(237, 29.39)).toBe(false);
    expect(isInBand(237, 31.9)).toBe(true);
    expect(isInBand(237, 31.91)).toBe(false);
  });

  it('rejects points past the lower and upper RA edges', () => {
    expect(isInBand(205, 30.65)).toBe(true);
    expect(isInBand(204.99, 30.65)).toBe(false);
    expect(isInBand(270, 30.65)).toBe(true);
    expect(isInBand(270.01, 30.65)).toBe(false);
  });
});
