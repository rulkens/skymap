import { describe, it, expect } from 'vitest';
import { galacticYearMyr } from '../../../src/utils/astro/galacticYearMyr';

describe('galacticYearMyr', () => {
  it('gives ~219 Myr for R0 = 8.178 kpc and v = 229 km/s', () => {
    const lapMyr = galacticYearMyr(0.008178, 229);
    expect(lapMyr).toBeGreaterThan(215);
    expect(lapMyr).toBeLessThan(225);
  });
});
