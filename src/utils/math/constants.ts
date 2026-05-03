/**
 * Cosmological constants shared across src/utils/math.
 *
 * These values are the physical inputs for every distance, velocity, and time
 * calculation in the renderer and tools. Centralising them here means every
 * derived module imports from one source of truth — no risk of the two files
 * using slightly different values for H₀ or c.
 */

/** Speed of light in km/s (exact by definition since 1983). */
export const C_KM_S = 299792.458;

/**
 * Hubble constant H₀ in km/s/Mpc.
 *
 * 70 is a round, commonly-used value; the actual measured value is somewhere
 * around 67–73 depending on the method (the "Hubble tension"). Since we're
 * using the linear approximation anyway, the exact value doesn't matter much
 * for visualization.
 */
export const H0_KM_S_MPC = 70;

/**
 * The Hubble distance c/H₀ ≈ 4282.75 Mpc.
 *
 * Precomputing means `redshiftToDistanceMpc` is a single multiplication
 * inside the hot loop that converts millions of catalog rows to xyz.
 */
export const HUBBLE_DISTANCE_MPC = C_KM_S / H0_KM_S_MPC;

/**
 * Hubble time t_H = 1/H₀, expressed in gigayears.
 *
 *   t_H = 1 / H₀  ×  (Mpc in km)  ÷  (seconds per Gyr)
 *       = 1/70  ×  3.0857 × 10¹⁹ km/Mpc  ÷  (3.156 × 10¹⁶ s/Gyr)
 *       ≈ 13.97 Gyr
 *
 * Reference: Ryden, "Introduction to Cosmology", 2nd ed., §2.4.
 * The seconds-per-year factor uses the Julian year (365.25 days).
 */
export const HUBBLE_TIME_GYR =
  ((1 / H0_KM_S_MPC) * 3.0857e19) / // 1 Mpc in km
  (60 * 60 * 24 * 365.25 * 1e9); // seconds in one gigayear (Julian)
