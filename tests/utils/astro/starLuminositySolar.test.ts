import { describe, expect, it } from 'vitest';

import { starLuminositySolar } from '../../../src/utils/astro/starLuminositySolar';

// L/L☉ = 10^(−0.4·(M_bol − 4.74)) with M_bol = absMagG + BC_G(T). Ground truth
// computed independently from the pinned formula — asserts the composition with
// bolometricCorrectionG and the M_bol,☉ = 4.74 zero-point are wired correctly.
describe('starLuminositySolar', () => {
  it('reads roughly one solar luminosity for a Sun-like dwarf', () => {
    expect(starLuminositySolar(4.67, 5683.94)).toBeCloseTo(1.0153, 3);
  });

  it('reads tens of solar luminosities for a luminous red giant', () => {
    expect(starLuminositySolar(0.7, 4720.95)).toBeCloseTo(46.394, 2);
  });
});
