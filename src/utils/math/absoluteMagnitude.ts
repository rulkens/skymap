/**
 * Compute absolute magnitude from apparent magnitude and distance.
 *
 * Apparent magnitudes are what the SDSS catalog records — the brightness as
 * seen from Earth, which depends on both the intrinsic luminosity and how far
 * away the galaxy is. Absolute magnitude removes the distance dependence,
 * giving a measure of true intrinsic brightness useful for comparisons.
 *
 * Formula (distance modulus):
 *   M = m − 5·log₁₀(d_Mpc) − 25
 *
 * The −25 arises because the zero-point is at 10 pc:
 *   5·log₁₀(10⁶ pc / 10 pc) = 5·5 = 25.
 */

/**
 * Absolute magnitude in the same photometric band as the supplied apparent
 * magnitude.
 *
 *   M = m − 5·log₁₀(d / 10 pc)
 *     = m − 5·log₁₀(d_Mpc · 10⁶ / 10)
 *     = m − 5·log₁₀(d_Mpc) − 25
 *
 * The −25 arises because 1 Mpc = 10⁶ pc and the distance modulus zero-point
 * is defined at 10 pc: 5·log₁₀(10⁶/10) = 5·log₁₀(10⁵) = 5·5 = 25.
 *
 * Returns NaN if `distanceMpc <= 0` (logarithm undefined).
 *
 * Reference values:
 *   - Sun:                 M_g ≈ +5.1
 *   - Milky Way:           M_g ≈ −20
 *   - Brightest galaxies:  M_g ≈ −23
 *
 * @param apparentMag  Observed (apparent) magnitude.
 * @param distanceMpc  Luminosity distance in megaparsecs. Must be > 0.
 */
export function absoluteMagnitude(
  apparentMag: number,
  distanceMpc: number,
): number {
  if (distanceMpc <= 0) return NaN;
  return apparentMag - 5 * Math.log10(distanceMpc) - 25;
}
