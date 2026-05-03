/**
 * Convert a spectroscopic redshift z to a comoving distance in megaparsecs.
 *
 * This is the first step in the sky-to-3D pipeline: every galaxy's position
 * in the point cloud is obtained by calling raDecZToCartesian, which in turn
 * calls this function to turn the dimensionless redshift into a physical
 * radius.
 *
 * The formula is Hubble's law in its simplest form:
 *
 *     d = c · z / H₀  =  HUBBLE_DISTANCE_MPC · z
 *
 * This linear approximation is accurate to a few percent for SDSS galaxies
 * (most z < 0.2). A full ΛCDM comoving-distance integral is deferred until
 * we actually need that precision.
 */

import { HUBBLE_DISTANCE_MPC } from './constants';

/**
 * Convert a redshift z to a comoving distance in Mpc using Hubble's law:
 *
 *     d = c · z / H₀
 *
 * Returns 0 at z = 0 (the observer). Linear in z — diverges from the true
 * cosmological distance once z ≳ 0.3 or so.
 */
export function redshiftToDistanceMpc(z: number): number {
  return HUBBLE_DISTANCE_MPC * z;
}
