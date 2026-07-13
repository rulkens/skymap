/**
 * Compute the present-day proper recession velocity in km/s for a given
 * redshift.
 *
 * Displayed in the info card as "recession velocity" alongside the redshift
 * value, giving non-technical users a familiar speed unit (km/s, comparable to
 * spacecraft velocities) to intuitively grasp how fast a galaxy is receding.
 *
 * Formula: v = H₀ × d_C(z), with d_C the flat-ΛCDM comoving distance.
 *
 * The alternative — the naive Doppler relation v = c·z — agrees at low z but
 * is meaningless past z ≈ 0.5: a z = 2.34 quasar came out at 700,000 km/s
 * (2.34c), which reads as a bug. v = H₀·d is Hubble's law applied at the
 * object's present-day proper distance, the standard "recession velocity"
 * of cosmology (Hogg 1999; Davis & Lineweaver 2004). It also matches the
 * card's own tooltip, which teaches exactly `v ≈ H₀ × d`.
 *
 * Note this velocity CAN exceed c — for our cosmology, everything past
 * z ≈ 1.5 recedes superluminally. That is real ΛCDM physics (proper
 * distances grow faster than c beyond the Hubble sphere; nothing moves
 * through space that fast), not an artifact, and the tooltip says so.
 *
 * Reference: Hogg 1999 (astro-ph/9905116) §4; Davis & Lineweaver 2004
 * (astro-ph/0310808) on why c·z and special-relativistic Doppler are both
 * the wrong quantity for cosmological redshifts.
 */

import { HUBBLE_DISTANCE_MPC, C_KM_S } from './constants';
import { redshiftToDistanceMpc } from './redshiftToDistanceMpc';

/**
 * Present-day proper recession velocity in km/s for a given redshift.
 *
 *   v = H₀ × d_C(z) = c × d_C(z) / d_H
 *
 * `redshiftToDistanceMpc` handles the regimes: flat-ΛCDM Simpson integral
 * for z > 0, exact 0 at z = 0, and the sign-preserving linear fallback for
 * the ~25 blueshifted Local Group / Virgo-infall galaxies (negative z →
 * negative velocity → "approaching", identical to c·z at that scale).
 *
 * @param z  Dimensionless redshift.
 */
export function hubbleVelocityKmS(z: number): number {
  return (C_KM_S * redshiftToDistanceMpc(z)) / HUBBLE_DISTANCE_MPC;
}
