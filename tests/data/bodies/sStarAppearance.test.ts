import { describe, expect, it } from 'vitest';

import { sStarAppearance } from '../../../src/data/bodies/sStarAppearance';

describe('sStarAppearance', () => {
  it('a brighter S-star comes out hotter and larger', () => {
    // S96 (kMag 10.0) and S23 (kMag 17.8) are the brightest and faintest
    // rows in the transcribed table, and both are 'early' — so this isolates
    // the monotonicity the brightness spread relies on from any effect of
    // switching spectral class, which a two-row lookup restatement would not.
    const brighter = sStarAppearance(10.0, 'early');
    const fainter = sStarAppearance(17.8, 'early');
    expect(brighter.temperatureK).toBeGreaterThan(fainter.temperatureK);
    expect(brighter.radiusSolar).toBeGreaterThan(fainter.radiusSolar);
  });
});
