/**
 * Convert an absolute magnitude to the apparent magnitude a star would show at
 * a given distance — the inverse of `math/absoluteMagnitude.ts`, but expressed
 * in parsecs rather than megaparsecs because stars live at parsec scales.
 *
 * Formula (the standard distance modulus):
 *
 *   m = M + 5·log₁₀(d_pc / 10)
 *
 * Absolute magnitude M is defined as the apparent magnitude a source would have
 * at exactly 10 pc, so the modulus is zero there and m === M. Every decade
 * (×10) further adds 5·log₁₀(10) = 5 magnitudes of dimming.
 *
 * We keep this as its own parsec-native helper rather than reusing
 * `absoluteMagnitude` (which takes Mpc and folds in the +25 zero-point): the
 * star InfoCard already carries distances in parsecs, and passing 10⁻⁶ Mpc
 * through the galaxy-scale helper would be both lossy and misleading about
 * intent.
 *
 * @param absMag      Absolute magnitude M.
 * @param distancePc  Distance to the star in parsecs. Must be > 0.
 */
export function apparentMagnitudeFromAbs(absMag: number, distancePc: number): number {
  return absMag + 5 * Math.log10(distancePc / 10);
}
