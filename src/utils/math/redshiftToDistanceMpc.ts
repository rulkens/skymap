/**
 * Convert a spectroscopic redshift z to a line-of-sight comoving distance in
 * megaparsecs, integrating the flat-ΛCDM Friedmann equation.
 *
 * The exact relation is:
 *
 *     d_C(z) = (c / H₀) · ∫₀^z dz' / E(z')
 *     E(z)  = √(Ω_m · (1 + z)³ + Ω_Λ)
 *
 * Compared to the linear-Hubble approximation `d = c · z / H₀`, this matters
 * for any survey that reaches beyond z ≈ 0.3 — Milliquas (quasars to z ≈ 7),
 * the SDSS/BOSS LRG sample, and the deep tail of GLADE all live in the regime
 * where the linear formula is wrong by tens of percent.
 *
 * The integral has no closed form for general (Ω_m, Ω_Λ), so we evaluate it
 * numerically with Simpson's rule (`SIMPSON_PANELS` even panels). The
 * integrand is smooth and monotone, so a fixed panel count is enough: at 64
 * panels relative error is below 1e-6 out to z = 10. The cost is a few
 * hundred sqrt + div per call — irrelevant at build time, and fine on the
 * cold paths of the runtime.
 */

import { HUBBLE_DISTANCE_MPC, USE_LCDM_DISTANCES } from './constants';

/**
 * Matter density parameter Ω_m at z = 0 (Planck 2018, TT,TE,EE+lowE+lensing).
 * Paired with `OMEGA_L = 1 - OMEGA_M` to keep the universe spatially flat —
 * the comoving-distance formula above assumes Ω_k = 0.
 */
const OMEGA_M = 0.315;
const OMEGA_L = 1 - OMEGA_M;

/**
 * Simpson's rule panel count. Must be even. 64 keeps relative error < 1e-6
 * across z ∈ [0, 10] — well past anything our catalogs reach.
 */
const SIMPSON_PANELS = 64;

/** Dimensionless Hubble parameter E(z) = H(z) / H₀ for flat ΛCDM. */
function eOfZ(z: number): number {
  const a = 1 + z;
  return Math.sqrt(OMEGA_M * a * a * a + OMEGA_L);
}

/**
 * Line-of-sight comoving distance in Mpc for redshift z.
 *
 * Returns 0 at z = 0 exactly.
 *
 * Negative z is a real, kept value: 2MRS preserves the peculiar-velocity
 * blueshift of ~25 nearby galaxies (Local Group members like M31/M33 plus
 * several Virgo galaxies whose infall velocity exceeds the Hubble flow).
 * The ΛCDM comoving integral is only defined for z ≥ 0, but |z| there is
 * tiny (< 0.002), so we fall back to the linear Hubble law — identical to
 * ΛCDM at that scale — and KEEP THE SIGN. That yields a negative radius,
 * mirroring the row through the origin exactly as the linear-distance
 * pipeline did before the ΛCDM swap. Crucially it does NOT collapse the
 * row onto the origin (which `return 0` would, stacking 25 max-size
 * sprites on the Milky Way). Astrophysically-correct redshift-independent
 * distances for the whole local volume are a separate effort — see
 * `docs/superpowers/specs/2026-05-21-local-volume-distances.md`.
 */
export function redshiftToDistanceMpc(z: number): number {
  if (z === 0) return 0;
  if (z < 0) return HUBBLE_DISTANCE_MPC * z;
  if (!USE_LCDM_DISTANCES) return HUBBLE_DISTANCE_MPC * z;

  // Composite Simpson over [0, z] with SIMPSON_PANELS sub-intervals.
  const h = z / SIMPSON_PANELS;
  // Endpoints: weight 1 each.
  let sum = 1 / eOfZ(0) + 1 / eOfZ(z);
  // Interior points: weight 4 (odd i) or 2 (even i).
  for (let i = 1; i < SIMPSON_PANELS; i++) {
    const weight = i % 2 === 0 ? 2 : 4;
    sum += weight / eOfZ(i * h);
  }
  return HUBBLE_DISTANCE_MPC * (h / 3) * sum;
}
