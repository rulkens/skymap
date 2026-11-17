import { describe, expect, it } from 'vitest';

import { eqCartToRaDecDist } from '../../../../tools/utils/math/eqCartToRaDecDist';
import { galToEq } from '../../../../tools/utils/math/galToEq';

describe('galToEq', () => {
  it('galToEq maps the galactic centre direction to RA 266.40°, Dec −28.94°', () => {
    const { raHours, decDeg } = eqCartToRaDecDist(galToEq([1, 0, 0]));
    expect(Math.abs(raHours * 15 - 266.4)).toBeLessThan(0.01);
    expect(Math.abs(decDeg + 28.94)).toBeLessThan(0.01);
  });

  // The matrix is built from 4-decimal pole positions, so it is orthonormal to ~1e-6, not 1e-15.
  it('galToEq keeps vectors unit length', () => {
    for (const v of [
      [0, 1, 0],
      [0, 0, 1],
      [0.6, -0.48, 0.64],
    ] as const) {
      expect(Math.hypot(...galToEq(v))).toBeCloseTo(1, 5);
    }
  });
});
