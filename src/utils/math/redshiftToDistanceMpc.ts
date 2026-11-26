/**
 * Convert a spectroscopic redshift z to a line-of-sight comoving distance in
 * megaparsecs, integrating the flat-ΛCDM (Ω_k = 0) Friedmann equation:
 *
 *     d_C(z) = (c / H₀) · ∫₀^z dz' / E(z'),   E(z) = √(Ω_m · (1 + z)³ + Ω_Λ)
 *
 * Past z ≈ 0.3 (Milliquas, the SDSS/BOSS LRG sample, GLADE's deep tail) the
 * linear `d = c · z / H₀` is wrong by tens of percent. The integral has no closed
 * form, so Simpson's rule evaluates it: the integrand is smooth and monotone.
 */

import type { Cosmology } from '../../@types/math/Cosmology';
import { C_KM_S, H0_KM_S_MPC, OMEGA_M, USE_LCDM_DISTANCES } from './constants';

const APP_COSMOLOGY: Cosmology = { h0KmSMpc: H0_KM_S_MPC, omegaM: OMEGA_M };

/** Even. 64 keeps relative error < 1e-6 across z ∈ [0, 10]. */
const SIMPSON_PANELS = 64;

/** Dimensionless Hubble parameter E(z) = H(z) / H₀ for flat ΛCDM. */
function eOfZ(z: number, omegaM: number): number {
  const a = 1 + z;
  return Math.sqrt(omegaM * a * a * a + (1 - omegaM));
}

/**
 * Negative z is a real, kept value: 2MRS keeps the blueshift of ~25 nearby
 * galaxies (M31, M33, infalling Virgo members). There |z| < 0.002, so the linear
 * Hubble law (identical to ΛCDM at that scale) applies and KEEPS THE SIGN:
 * `hubbleVelocityKmS` reads the blueshift off it, and `buildAllBins` places such
 * a galaxy at `|distance|` in its true direction, never mirrored through the origin.
 * `cosmology` defaults to the app's; pass one for a catalog measured against another.
 */
export function redshiftToDistanceMpc(z: number, cosmology: Cosmology = APP_COSMOLOGY): number {
  const { omegaM } = cosmology;
  const hubbleDistanceMpc = C_KM_S / cosmology.h0KmSMpc;
  if (z === 0) return 0;
  if (z < 0) return hubbleDistanceMpc * z;
  if (!USE_LCDM_DISTANCES) return hubbleDistanceMpc * z;

  // Composite Simpson over [0, z] with SIMPSON_PANELS sub-intervals.
  const h = z / SIMPSON_PANELS;
  // Endpoints: weight 1 each.
  let sum = 1 / eOfZ(0, omegaM) + 1 / eOfZ(z, omegaM);
  // Interior points: weight 4 (odd i) or 2 (even i).
  for (let i = 1; i < SIMPSON_PANELS; i++) {
    const weight = i % 2 === 0 ? 2 : 4;
    sum += weight / eOfZ(i * h, omegaM);
  }
  return hubbleDistanceMpc * (h / 3) * sum;
}
