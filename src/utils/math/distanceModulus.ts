/**
 * Distance modulus utilities.
 *
 * Converts between apparent magnitude `m` (what we observe), absolute
 * magnitude `M` (what the galaxy would appear to be at 10 pc), and
 * distance in Mpc.  The classical relation is
 *
 *     m − M = 5·log₁₀(d_pc / 10)
 *
 * which we rewrite for our Mpc-based positions as
 *
 *     M = m − 5·log₁₀(d_Mpc) − 25.
 *
 * The constant −25 absorbs `5·log₁₀(10⁶ / 10) = 5·log₁₀(10⁵) = 25`.
 *
 * Used by every Malmquist-bias correction mode: `volume-limited` thresholds
 * on M, `1/V_max` derives `d_max(M)` from M, `Schechter` integrates the LF
 * over absolute magnitude.  All three need this conversion at some point,
 * which is why it lives in a dedicated module rather than inline in any
 * single mode's helper.
 */

const LOG10 = Math.log(10);

/**
 * Compute absolute magnitude `M` from apparent magnitude `m` and distance
 * in Mpc.  Returns NaN for non-positive distance — the only sensible
 * sentinel because the formula is undefined there.
 */
export function absoluteFromApparent(m: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return m - (5 * Math.log(dMpc)) / LOG10 - 25;
}

/**
 * Inverse: compute apparent `m` from absolute `M` and distance in Mpc.
 * Used by `vMaxWeight` to derive the maximum distance at which a galaxy
 * of intrinsic magnitude `M` would still hit the survey's flux limit.
 */
export function apparentFromAbsolute(M: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return M + (5 * Math.log(dMpc)) / LOG10 + 25;
}

/**
 * Maximum distance (Mpc) at which a galaxy of absolute magnitude `M`
 * hits the survey's apparent flux limit `m_lim`.  Used by `vMaxWeight`.
 *
 *     m_lim = M + 5·log₁₀(d_max_Mpc) + 25
 *     d_max_Mpc = 10^((m_lim − M − 25) / 5)
 */
export function dMaxFromAbsolute(M: number, mLim: number): number {
  return Math.pow(10, (mLim - M - 25) / 5);
}
