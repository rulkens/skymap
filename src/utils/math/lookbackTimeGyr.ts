/**
 * Compute the lookback time in gigayears for a given redshift.
 *
 * "Lookback time" is how long ago the light we see now left the source —
 * a more intuitive cosmological distance measure than Mpc for human audiences.
 * The engine uses this to populate the "earthEra" field in GalaxyInfo, giving
 * users a relatable Earth-history anchor like "during Earth's Mesoproterozoic".
 *
 * Approximation: t_L = (z / (1 + z)) × t_H  (coasting universe / low-z limit)
 *
 * This is exact for an empty (Ω=0) universe and a good approximation in the
 * concordance ΛCDM model for z ≪ 1. SDSS galaxies are mostly z < 0.3, so
 * the error is under 5%.
 *
 * Reference: Pen 1999 (ApJS 120, 49), eq. 4; Hogg 1999 (astro-ph/9905116).
 */

import { HUBBLE_TIME_GYR } from './constants';

/**
 * Lookback time in gigayears (Gyr) — how long ago the light we see now left
 * the source.
 *
 * Approximation: t_L = (z / (1 + z)) × t_H
 *
 * This is exact for a coasting (empty, Ω=0) universe and a good
 * approximation in our concordance ΛCDM model for z ≪ 1. SDSS galaxies are
 * mostly z < 0.3, so the error is under 5%. For z = 0 the function returns 0
 * (no lookback at the present epoch).
 *
 * Reference: Pen 1999 (ApJS 120, 49), eq. 4; also Hogg 1999 (astro-ph/9905116).
 *
 * @param z  Dimensionless redshift. z = 0 → present; z = 1 → light left the
 *           source when the universe was half its current age (in this approximation).
 */
export function lookbackTimeGyr(z: number): number {
  // z / (1 + z) maps [0, ∞) → [0, 1) and gives the exact lookback fraction
  // for an empty universe. Multiplied by the Hubble time it yields a time in Gyr.
  return (z / (1 + z)) * HUBBLE_TIME_GYR;
}
