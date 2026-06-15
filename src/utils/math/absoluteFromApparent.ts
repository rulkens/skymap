/**
 * Compute absolute magnitude `M` from apparent magnitude `m` and distance
 * in Mpc.
 *
 * The classical distance-modulus relation is
 *
 *     m − M = 5·log₁₀(d_pc / 10)
 *
 * which we rewrite for our Mpc-based positions as
 *
 *     M = m − 5·log₁₀(d_Mpc) − 25.
 *
 * The constant −25 absorbs `5·log₁₀(10⁶ / 10) = 5·log₁₀(10⁵) = 25`.
 *
 * Returns NaN for non-positive distance — the only sensible sentinel
 * because the formula is undefined there.
 */
export function absoluteFromApparent(m: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return m - (5 * Math.log(dMpc)) / Math.LN10 - 25;
}
