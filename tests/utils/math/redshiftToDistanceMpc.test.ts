/**
 * Unit tests for `redshiftToDistanceMpc`.
 *
 * The function evaluates the flat-ΛCDM line-of-sight comoving-distance
 * integral by Simpson's rule (see the source for the formula).  We pin
 * the boundary case (z = 0), a small-z value where ΛCDM and linear
 * Hubble nearly agree, a high-z value where they diverge sharply, and
 * monotonicity across the operative redshift range.
 *
 * Reference values are computed against an independent Python integration
 * with (Ω_m, Ω_Λ) = (0.315, 0.685), H₀ = 70 km/s/Mpc.  Tolerances are
 * generous enough that small tweaks to `SIMPSON_PANELS` don't churn the
 * tests — the load-bearing assertion is "agrees with the analytic limit
 * at low z and diverges from linear Hubble at high z".
 */

import { describe, it, expect } from 'vitest';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';
import { HUBBLE_DISTANCE_MPC } from '../../../src/utils/math/constants';

describe('redshiftToDistanceMpc', () => {
  it('returns 0 for z = 0 (the observer is at the origin)', () => {
    expect(redshiftToDistanceMpc(0)).toBe(0);
  });

  it('approaches linear Hubble at small z', () => {
    // At z = 0.001 the leading-order ΛCDM correction is ~0.02% — well
    // within 1% of the linear-Hubble value.  Asserting in relative terms
    // because the absolute Mpc gap (~0.001 Mpc) is below toBeCloseTo's
    // absolute-diff resolution.
    const z = 0.001;
    const linear = HUBBLE_DISTANCE_MPC * z;
    const lcdm = redshiftToDistanceMpc(z);
    expect(Math.abs(lcdm - linear) / linear).toBeLessThan(0.001);
  });

  it('returns ~413 Mpc for z = 0.1 (ΛCDM Planck 2018)', () => {
    // Reference: flat ΛCDM with (Ω_m, Ω_Λ) = (0.315, 0.685), H₀ = 70.
    // d_C(0.1) ≈ 413 Mpc — about 15 Mpc closer than the linear-Hubble
    // value of 428 Mpc, the discrepancy that motivated the swap.
    const d = redshiftToDistanceMpc(0.1);
    expect(d).toBeGreaterThan(410);
    expect(d).toBeLessThan(420);
  });

  it('returns ~5100 Mpc for z = 2 (well into the divergent regime)', () => {
    // At z = 2 the linear approximation gives 8566 Mpc — a 67% overestimate.
    // ΛCDM with (Ω_m, Ω_Λ) = (0.315, 0.685) gives ~5114 Mpc.  Range covers
    // the small variation expected from tweaking SIMPSON_PANELS.
    const d = redshiftToDistanceMpc(2);
    expect(d).toBeGreaterThan(5050);
    expect(d).toBeLessThan(5200);
  });

  it('is strictly less than linear Hubble for z > 0', () => {
    // ΛCDM E(z) > 1 for all z > 0 (matter density boosts the expansion
    // rate at early times), so the integrand 1/E(z') < 1, and the
    // comoving distance is strictly below the linear value c·z/H₀.
    for (const z of [0.05, 0.5, 1.0, 3.0, 5.0]) {
      expect(redshiftToDistanceMpc(z)).toBeLessThan(HUBBLE_DISTANCE_MPC * z);
    }
  });

  it('is monotonic across z in [0, 7]', () => {
    // Higher redshifts must always map to larger distances.  Covers the
    // full Milliquas tail.
    let prev = -1;
    for (let z = 0; z <= 7; z += 0.25) {
      const d = redshiftToDistanceMpc(z);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
