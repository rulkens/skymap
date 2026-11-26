/**
 * massWeightFromLog10 — log10(M / Msun) → stellar mass in 1e12 Msun, the linear weight
 * the port's `log10(1 + W)` expects (its SDSS run has mean W 0.0415). Fed log-mass
 * directly, that formula takes the logarithm twice and flattens the spread.
 */
export function massWeightFromLog10(log10MassMsun: number): number {
  return 10 ** (log10MassMsun - 12);
}
