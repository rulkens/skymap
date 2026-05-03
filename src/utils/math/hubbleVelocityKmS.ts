/**
 * Compute the Hubble recession velocity in km/s for a given redshift.
 *
 * Displayed in the info card as "recession velocity" alongside the redshift
 * value, giving non-technical users a familiar speed unit (km/s, comparable to
 * spacecraft velocities) to intuitively grasp how fast a galaxy is receding.
 *
 * Formula: v = c × z  (non-relativistic / low-z limit)
 *
 * Reference: Hubble 1929; see Harrison 1993 for caveats on interpreting
 * recession "velocity" in an expanding spacetime.
 */

import { C_KM_S } from './constants';

/**
 * Hubble recession velocity in km/s for a given redshift.
 *
 *   v = c × z
 *
 * This is the naïve (non-relativistic) relation, valid at low z. For
 * SDSS spectroscopic galaxies (z < 0.5) the error vs. the relativistic
 * formula is < 25%. At z ≈ 0.1 (the SDSS main galaxy sample peak) the
 * error is only ~5%.
 *
 * Reference: Hubble 1929; see also Harrison 1993 for caveats on interpreting
 * recession "velocity" in an expanding spacetime.
 *
 * @param z  Dimensionless redshift.
 */
export function hubbleVelocityKmS(z: number): number {
  return C_KM_S * z;
}
