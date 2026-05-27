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
 * Cosmology toggle for the redshift ↔ distance conversion.
 *
 * - `true`  → flat-ΛCDM Simpson integral (Ω_m = 0.315, Ω_Λ = 0.685).
 *             Physically correct out to z ≈ 7; required for Milliquas
 *             and the deep BOSS/SDSS-LRG tail.
 * - `false` → linear Hubble `d = c · z / H₀`. Fast, closed-form, off
 *             by tens of percent past z ≈ 0.3, but useful for A/B
 *             comparisons and for reproducing pre-ΛCDM .bin layouts.
 *
 * Flipping this is a build-time decision — positions are baked into
 * `public/data/*.bin`, so changes require `npm run build-tiers` +
 * `npm run build-famous` to take effect.  Both `redshiftToDistanceMpc`
 * and `distanceMpcToRedshift` read this flag so the forward and
 * inverse stay self-consistent regardless of the choice.
 */
export const USE_LCDM_DISTANCES = true;

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

/**
 * Parsec → light-year conversion factor.
 *
 *   1 pc = 3.26156 ly
 *
 * Why surface this as a constant?  The renderer's distance-formatting
 * helpers ship every parsec value alongside its light-year equivalent
 * for readers unfamiliar with parsecs.  A single source of truth here
 * means the scale bar, the InfoCard distance line, and the InfoCard
 * diameter line all derive the same conversion — no risk of one site
 * using 3.26 and another using 3.262 and producing visibly different
 * round-offs at the same zoom level.
 *
 * The exact value depends on the IAU's 2015 redefinition of the
 * astronomical unit; 3.26156 is the textbook short form (the full
 * value is ~3.261563777…).  Five significant figures is more than
 * enough — the renderer's distances themselves carry at most 3-4
 * meaningful digits.
 */
export const PC_TO_LY = 3.26156;
