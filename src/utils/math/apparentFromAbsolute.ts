/**
 * Compute apparent magnitude `m` from absolute magnitude `M` and distance
 * in Mpc — the inverse of `absoluteFromApparent`.
 *
 *     m = M + 5·log₁₀(d_Mpc) + 25
 *
 * Used by `vMaxWeight` to derive the maximum distance at which a galaxy
 * of intrinsic magnitude `M` would still hit the galaxy catalog's flux
 * limit.  Returns NaN for non-positive distance.
 */
export function apparentFromAbsolute(M: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return M + (5 * Math.log(dMpc)) / Math.LN10 + 25;
}
