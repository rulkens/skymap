/**
 * Regression test for `iauRaDecSuffix` — the coordinate-only portion of
 * an IAU designation, factored out of `iauName` so any survey prefix
 * (including the Milliquas parent-survey prefixes reconstructed from the
 * bin's parentSurveyByte) can share the same exact coord-string emitter.
 *
 * Every case below is paired with the historical `iauName(Source.SDSS,
 * ra, dec)` output: stripping `"SDSS "` from the front must yield the
 * suffix.  That equality is the contract these two functions must
 * preserve forever, so we pin it directly.
 */
import { describe, it, expect } from 'vitest';
import { iauRaDecSuffix } from '../../../src/utils/math/iauRaDecSuffix';
import { iauName } from '../../../src/utils/math/iauName';
import { Source } from '../../../src/data/sources';

describe('iauRaDecSuffix', () => {
  it('matches the historical SDSS designation suffix for a canonical RA/Dec', () => {
    expect(iauRaDecSuffix(188.7365, 1.396)).toBe('J123456.75+012345.5');
  });

  it('emits a leading + for Dec=0', () => {
    expect(iauRaDecSuffix(0, 0)).toBe('J000000.00+000000.0');
  });

  it('emits a leading - for negative declinations', () => {
    expect(iauRaDecSuffix(0, -45.5)).toContain('-453000.0');
  });

  it('wraps negative RA into [0, 360)', () => {
    expect(iauRaDecSuffix(-10, 0)).toMatch(/^J2320/);
  });

  it('agrees with iauName(SDSS, ...) after the "SDSS " prefix is stripped', () => {
    const ra = 188.736500001;
    const dec = 1.396;
    expect(`SDSS ${iauRaDecSuffix(ra, dec)}`).toBe(iauName(Source.SDSS, ra, dec));
  });
});
