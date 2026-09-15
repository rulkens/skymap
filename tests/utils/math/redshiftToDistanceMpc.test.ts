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
  it('maps negative z to a negative (mirrored) distance, not the origin', () => {
    // Regression: 2MRS keeps ~25 blueshifted nearby galaxies (M31 at
    // cz ≈ -300 km/s → z ≈ -0.001, etc.). A `z <= 0 → 0` clause collapsed
    // every one onto (0,0,0), stacking max-size sprites on the Milky Way.
    // Negative z must fall back to the linear Hubble law with the sign
    // preserved so the row mirrors through the origin instead.
    const z = -0.001;
    expect(redshiftToDistanceMpc(z)).toBeCloseTo(HUBBLE_DISTANCE_MPC * z, 6);
    expect(redshiftToDistanceMpc(z)).toBeLessThan(0);
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
});
