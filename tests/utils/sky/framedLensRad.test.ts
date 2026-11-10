import { describe, expect, it } from 'vitest';

import { framedLensRad } from '../../../src/utils/sky/framedLensRad';
import { degToRad } from '../../../src/utils/math/degToRad';

const DEG = degToRad(1);

describe('framedLensRad', () => {
  it('M31 frames at about 3 × its diameter', () => {
    // ~3° across at 0.78 Mpc.
    const radiusMpc = 0.78 * Math.tan(1.5 * DEG);
    expect(framedLensRad(radiusMpc, 0.78, 60 * DEG, false) / DEG).toBeCloseTo(9, 6);
  });

  it('never widens the lens, and never goes under the 1′ stop', () => {
    expect(framedLensRad(0.1, 0.78, 5 * DEG, false)).toBe(5 * DEG);
    expect(framedLensRad(1e-12, 1, 60 * DEG, false) / DEG).toBeCloseTo(1 / 60, 9);
  });

  it('a star halves the lens down to 10°', () => {
    expect(framedLensRad(0, 1, 60 * DEG, true) / DEG).toBeCloseTo(30, 9);
    expect(framedLensRad(0, 1, 15 * DEG, true) / DEG).toBeCloseTo(10, 9);
    expect(framedLensRad(0, 1, 8 * DEG, true) / DEG).toBeCloseTo(8, 9);
  });
});
