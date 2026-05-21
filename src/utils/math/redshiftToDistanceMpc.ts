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
 * Line-of-sight comoving distance in Mpc for redshift z ≥ 0.
 *
 * Returns 0 at z = 0 exactly. Negative z (peculiar-velocity blueshift in
 * the Local Group) is treated as 0 — callers that need true blueshift
 * handling (2MRS Local Group rows) bake the position from `cz / H₀`
 * upstream and never reach this function.
 */
export function redshiftToDistanceMpc(z: number): number {
  if (z <= 0) return 0;
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
