/**
 * Invert `M = e·sinh(H) − H` for the hyperbolic anomaly H, in radians — the
 * `e > 1` sibling of `eccentricAnomalyFromMean`, which owns `e < 1` and stays
 * untouched. M is unwrapped and grows large downrange; wrapping it to a period
 * a hyperbola does not have would move the body. Newton's root is unique here
 * for the usual reason: `g'(H) = e·cosh H − 1 ≥ e − 1 > 0`.
 */
export function hyperbolicAnomalyFromMean(meanAnomalyRad: number, eccentricity: number): number {
  // The large-|M| asymptote, where the −H term stops mattering.
  let hAnom = Math.asinh(meanAnomalyRad / eccentricity);

  // The elliptic solver's tolerance; the higher cap covers a near-parabolic e,
  // where g' ≈ e − 1 flattens and convergence slows.
  const MAX_ITERATIONS = 40;
  const TOLERANCE = 1e-14;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const residual = eccentricity * Math.sinh(hAnom) - hAnom - meanAnomalyRad;
    const derivative = eccentricity * Math.cosh(hAnom) - 1;
    const step = residual / derivative;
    hAnom -= step;
    if (Math.abs(step) < TOLERANCE) break;
  }

  return hAnom;
}
