/**
 * Regression test for `iauRaDecSuffix` — the coordinate-only portion of
 * an IAU designation, factored out of `iauName` so any galaxy catalog prefix
 * (including the Milliquas parent-survey prefixes reconstructed from the
 * bin's parentSurveyByte) can share the same exact coord-string emitter.
 *
 * The case below pins the historical `iauName(Source.SDSS, ra, dec)`
 * output with `"SDSS "` stripped from the front — the string the
 * Milliquas branch now reconstructs from the bin.
 */
import { describe, it, expect } from 'vitest';
import { iauRaDecSuffix } from '../../../src/utils/math/iauRaDecSuffix';

describe('iauRaDecSuffix', () => {
  it('matches the historical SDSS designation suffix for a canonical RA/Dec', () => {
    expect(iauRaDecSuffix(188.7365, 1.396)).toBe('J123456.75+012345.5');
  });
});
