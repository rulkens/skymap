import { describe, it, expect } from 'vitest';
import { luminosityDistanceMpcToRedshift } from '../../../../tools/utils/math/luminosityDistanceMpcToRedshift';
import { redshiftToDistanceMpc } from '../../../../src/utils/math/redshiftToDistanceMpc';

describe('luminosityDistanceMpcToRedshift', () => {
  it('returns 0 for d ≤ 0 or NaN', () => {
    expect(luminosityDistanceMpcToRedshift(0)).toBe(0);
    expect(luminosityDistanceMpcToRedshift(-5)).toBe(0);
    expect(luminosityDistanceMpcToRedshift(NaN)).toBe(0);
  });

  it('round-trips (1+z)·D_C(z) across the REGALADE range and beyond', () => {
    // Precision 5 matches the comoving inverse's own LUT budget.
    for (const z of [0.001, 0.04, 0.2, 0.37, 1.0, 2.0, 5.0]) {
      const dL = (1 + z) * redshiftToDistanceMpc(z);
      expect(luminosityDistanceMpcToRedshift(dL)).toBeCloseTo(z, 5);
    }
  });

  it('lands below the comoving inverse of the same distance', () => {
    // The whole point: D_L > D_C at any z > 0, so reading a luminosity
    // distance as comoving over-places the galaxy.
    const dL = (1 + 0.3) * redshiftToDistanceMpc(0.3);
    expect(luminosityDistanceMpcToRedshift(dL)).toBeLessThan(0.3 * 1.001);
    expect(luminosityDistanceMpcToRedshift(dL)).toBeGreaterThan(0.3 * 0.999);
  });
});
