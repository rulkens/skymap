/**
 * Unit tests for `redshiftToDistanceMpc`.
 *
 * The function is Hubble's-law in its simplest form: d = c·z/H₀.  We verify
 * the boundary case (z=0) and a representative SDSS-scale value, plus
 * monotonicity across the operative redshift range.
 *
 * Reference value (with H₀ = 70 km/s/Mpc, c ≈ 299792.458 km/s):
 *   z = 0.1 → d = 0.1 · 4282.75 ≈ 428.3 Mpc
 */

import { describe, it, expect } from 'vitest';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';
import { HUBBLE_DISTANCE_MPC } from '../../../src/utils/math/constants';

describe('redshiftToDistanceMpc', () => {
  it('returns 0 for z = 0 (the observer is at the origin)', () => {
    expect(redshiftToDistanceMpc(0)).toBe(0);
  });

  it('returns ~428 Mpc for z = 0.1 (Hubble-law approximation)', () => {
    // c/H₀ ≈ 4282.75 Mpc; multiplied by z=0.1 gives ~428.3 Mpc.
    // This is the textbook Hubble flow distance for a typical SDSS galaxy.
    expect(redshiftToDistanceMpc(0.1)).toBeCloseTo(HUBBLE_DISTANCE_MPC * 0.1, 4);
    expect(redshiftToDistanceMpc(0.1)).toBeGreaterThan(420);
    expect(redshiftToDistanceMpc(0.1)).toBeLessThan(435);
  });

  it('is linear in z (Hubble approximation, by definition)', () => {
    // Doubling z must exactly double the distance — the linearity is the
    // whole point of using this approximation rather than the full ΛCDM integral.
    expect(redshiftToDistanceMpc(0.2)).toBeCloseTo(redshiftToDistanceMpc(0.1) * 2, 6);
  });

  it('is monotonic across z in [0, 1]', () => {
    // Higher redshifts must always map to larger distances.  Stepping in
    // increments of 0.05 covers the full SDSS spec-z range.
    let prev = -1;
    for (let z = 0; z <= 1; z += 0.05) {
      const d = redshiftToDistanceMpc(z);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
