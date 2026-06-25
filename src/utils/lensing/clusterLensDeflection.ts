/**
 * clusterLensDeflection — convert a cluster's physical radius R500 (Mpc) into
 * the SIS-equivalent total deflection angle α∞ (radians) and the NFW scale
 * radius r_s (Mpc).
 *
 * ## Closed-form derivation
 *
 * We model each cluster as a singular isothermal sphere (SIS) truncated at
 * R500 — the radius enclosing 500 times the critical density. This keeps the
 * physics transparent and gives a single closed-form expression for α∞ in
 * terms of R500 alone.
 *
 * ### Step 1 — cluster mass
 *
 * By definition of R500:
 *
 *   M500 = (4/3) · π · 500 · ρ_crit · R500³
 *
 * where ρ_crit = 3·H₀² / (8·π·G) is the critical density of the universe.
 *
 * ### Step 2 — velocity dispersion
 *
 * For an SIS in virial equilibrium the 1D velocity dispersion is:
 *
 *   σ_v² = G · M500 / (2 · R500)
 *         = (4/3)·π · 500 · G · ρ_crit · R500² / 2
 *         = (2·π/3) · 500 · G · ρ_crit · R500²
 *
 * ### Step 3 — total deflection angle
 *
 * A SIS lens deflects a ray by:
 *
 *   α∞ = 4·π · σ_v² / c²
 *       = 4·π · (2·π/3) · 500 · G · ρ_crit · R500² / c²
 *       = (8·π²/3) · 500 · G · ρ_crit / c²  ·  R500²
 *       ≡ K · R500²
 *
 * K is precomputed once at module load time since H₀, G, and c are constants.
 * α∞ is in radians; converting to arcseconds (× 206265) gives tens of arcsec
 * for a Coma-class cluster — consistent with observed Einstein radii.
 *
 * ### NFW scale radius
 *
 * The NFW profile parameterises halo structure with a concentration c500
 * (ratio of R500 to the scale radius r_s). Empirically c500 ≈ 3.2 for massive
 * clusters (equivalent to c200 ≈ 5 in the more common M200 convention). This
 * is strength-independent — the same c500 applies regardless of cluster mass —
 * so r_s is a pure geometric rescaling of R500:
 *
 *   r_s = R500 / c500 = R500 / 3.2
 *
 * r_s enters the GPU lensing shader as the projected-radius normalisation for
 * the NFW enclosed-mass shape m(x) = g(|x|/r_s). Keeping c500 as a named
 * local constant (rather than inlining 1/3.2 ≈ 0.3125) preserves the physical
 * meaning and makes it easy to experiment with alternative concentration values.
 */

import { C_KM_S, G, H0_KM_S_MPC } from '../math/constants';

// Concentration parameter c500 = R500 / r_s.
// 3.2 corresponds to c200 ≈ 5, a well-established empirical value for
// X-ray-selected clusters (Ettori et al. 2010, Bhatt et al. 2013).
const C500 = 3.2;

// Critical density of the universe in M☉ / Mpc³.
//   ρ_crit = 3·H₀² / (8·π·G)
// With H₀ = 70 km/s/Mpc and G in Mpc·(km/s)²·M☉⁻¹ the result is
// dimensionally M☉/Mpc³ — exactly the units M500's definition needs.
// ≈ 1.360 × 10¹¹  M☉ / Mpc³
const RHO_CRIT = (3 * H0_KM_S_MPC ** 2) / (8 * Math.PI * G);

// Lensing strength prefactor K such that α∞ = K · R500² [rad].
//   K = (8·π²/3) · 500 · G · ρ_crit / c²
// All quantities are in consistent astrophysical units so the ratio G·ρ_crit/c²
// is dimensionless once multiplied by Mpc² — the Mpc² factor arrives from R500².
// ≈ 8.56 × 10⁻⁵  rad / Mpc²
const K = ((8 * Math.PI ** 2) / 3) * 500 * G * RHO_CRIT / C_KM_S ** 2;

/**
 * Convert a cluster's physical radius R500 to a lensing deflection angle and
 * NFW scale radius.
 *
 * @param physicalRadiusMpc  R500 in Mpc (non-negative; negative input is
 *                           physically undefined and produces negative outputs
 *                           without any guard, matching the closed form).
 *
 * @returns
 *   alphaInfRad — SIS total deflection angle in radians (α∞ = K · R500²).
 *   rsMpc       — NFW scale radius in Mpc (r_s = R500 / c500).
 */
export function clusterLensDeflection(physicalRadiusMpc: number): {
  alphaInfRad: number;
  rsMpc: number;
} {
  return {
    alphaInfRad: K * physicalRadiusMpc * physicalRadiusMpc,
    rsMpc: physicalRadiusMpc / C500,
  };
}
