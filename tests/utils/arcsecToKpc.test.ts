/**
 * arcsecToKpc converts an angular size on the sky (arcseconds) to a
 * physical size (kiloparsecs) at a given comoving distance.
 *
 * The math is the small-angle approximation: physicalSize = θ × distance,
 * where θ is in radians. We multiply arcseconds by π/(180·3600) to convert
 * to radians, then multiply by distance_Mpc × 1000 to land in kpc.
 */

import { describe, it, expect } from 'vitest';
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';

describe('arcsecToKpc', () => {
  it('converts 1 arcsec at 1 Mpc to ≈ 4.848e-3 kpc', () => {
    expect(arcsecToKpc(1, 1)).toBeCloseTo(4.848e-3, 6);
  });

  it('converts a 30" galaxy at 100 Mpc to ≈ 14.5 kpc', () => {
    expect(arcsecToKpc(30, 100)).toBeCloseTo(14.54, 2);
  });

  it('returns NaN when distance is non-finite', () => {
    expect(Number.isNaN(arcsecToKpc(10, NaN))).toBe(true);
  });

  it('returns NaN when arcsec is non-finite', () => {
    expect(Number.isNaN(arcsecToKpc(NaN, 100))).toBe(true);
  });

  it('returns 0 when arcsec is 0', () => {
    expect(arcsecToKpc(0, 100)).toBe(0);
  });
});
