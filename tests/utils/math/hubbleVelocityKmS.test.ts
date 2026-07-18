/**
 * Unit tests for `hubbleVelocityKmS` — the present-day proper recession
 * velocity v = H₀ · d_C(z), with d_C the flat-ΛCDM comoving distance.
 *
 * Reference values are computed against an independent Python integration
 * with (Ω_m, Ω_Λ) = (0.315, 0.685), H₀ = 70 km/s/Mpc — the same source as
 * the `redshiftToDistanceMpc` test suite. Ranges are generous enough that
 * SIMPSON_PANELS tweaks don't churn the tests; the load-bearing assertions
 * are "agrees with c·z at low z" and "stays far below c·z at high z".
 */

import { describe, it, expect } from 'vitest';
import { hubbleVelocityKmS } from '../../../src/utils/math/hubbleVelocityKmS';
import { C_KM_S } from '../../../src/utils/math/constants';

describe('hubbleVelocityKmS', () => {
  it('returns 0 km/s at z = 0 (no expansion for the present epoch)', () => {
    expect(hubbleVelocityKmS(0)).toBe(0);
  });

  it('agrees with c·z at low z (the classical Hubble-law regime)', () => {
    // At z = 0.01 the ΛCDM comoving distance is within ~1% of the linear
    // c·z/H₀, so v = H₀·d_C must land within 1% of c·z. This is the regime
    // covering almost every galaxy in the catalogs.
    const z = 0.01;
    const cz = C_KM_S * z;
    expect(Math.abs(hubbleVelocityKmS(z) - cz) / cz).toBeLessThan(0.01);
  });

  it('preserves the blueshift sign for negative z (Local Group infall)', () => {
    // 2MRS keeps ~25 blueshifted nearby galaxies (M31 at cz ≈ -300 km/s).
    // The ΛCDM integral is undefined for z < 0; the linear fallback must
    // keep the sign so the card reads as approaching, not receding.
    const z = -0.001;
    expect(hubbleVelocityKmS(z)).toBeCloseTo(C_KM_S * z, 6);
    expect(hubbleVelocityKmS(z)).toBeLessThan(0);
  });

  it('returns ~388,000 km/s at z = 2.336, not the naive c·z = 700,315', () => {
    // Regression: a z = 2.336 SDSS quasar displayed "700,315 km/s away" —
    // c·z pushed far past its low-z validity. The proper recession velocity
    // is H₀ · d_C(2.336) ≈ 70 × ~5550 Mpc ≈ 388,000 km/s (~1.30c).
    // Genuinely superluminal — expansion of space, not motion through it —
    // but nowhere near 2.34c.
    const v = hubbleVelocityKmS(2.336);
    expect(v).toBeGreaterThan(380_000);
    expect(v).toBeLessThan(397_000);
    expect(v).toBeGreaterThan(C_KM_S); // superluminal is correct here…
    expect(v).toBeLessThan(C_KM_S * 2.336); // …but far below naive c·z
  });
});
