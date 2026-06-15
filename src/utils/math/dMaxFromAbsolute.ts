/**
 * Maximum distance (Mpc) at which a galaxy of absolute magnitude `M`
 * hits the galaxy catalog's apparent flux limit `m_lim`.  Used by
 * `vMaxWeight`.
 *
 *     m_lim = M + 5·log₁₀(d_max_Mpc) + 25
 *     d_max_Mpc = 10^((m_lim − M − 25) / 5)
 */
export function dMaxFromAbsolute(M: number, mLim: number): number {
  return Math.pow(10, (mLim - M - 25) / 5);
}
