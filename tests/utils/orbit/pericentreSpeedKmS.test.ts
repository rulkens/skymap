import { describe, it, expect } from 'vitest';
import { pericentreSpeedKmS } from '../../../src/utils/orbit/pericentreSpeedKmS';

describe('pericentreSpeedKmS', () => {
  it("matches S2's published 7650 km/s pericentre speed within 2%", () => {
    // The external oracle (GRAVITY Collaboration's S2 orbit), and the only check
    // here that pins the formula's shape: an inverted (1+e)/(1−e), a wrong
    // AU/yr → km/s factor, or a dropped 2π all land far outside 2%.
    const speed = pericentreSpeedKmS(1026, 0.884, 16.0);

    expect(Math.abs(speed - 7650) / 7650).toBeLessThan(0.02);
  });

  it('is faster at pericentre than a circular orbit of the same period', () => {
    // The monotone property — a swapped eccentricity ratio makes the eccentric
    // orbit slower instead, which the S2 oracle alone would not localise.
    const circular = pericentreSpeedKmS(1026, 0, 16.0);
    const eccentric = pericentreSpeedKmS(1026, 0.884, 16.0);

    expect(eccentric).toBeGreaterThan(circular);
  });
});
