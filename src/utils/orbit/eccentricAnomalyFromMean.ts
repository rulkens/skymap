/**
 * Invert Kepler's equation: solve `M = E − e·sin(E)` for the eccentric
 * anomaly `E`, given the mean anomaly `M` and eccentricity `e`.
 *
 * WHY an iterative solve. The forward direction `M = E − e·sin(E)` is a
 * closed-form one-liner, but the inverse (`E` from `M`) is transcendental —
 * the `sin(E)` term prevents an algebraic rearrangement. Newton's method is
 * the standard remedy: for a bound elliptical orbit (`e < 1`) the function
 * `g(E) = E − e·sin(E) − M` is monotone (`g'(E) = 1 − e·cos(E) ≥ 1 − e > 0`),
 * so it has a single root and Newton converges quadratically — the digit
 * count roughly doubles each step, reaching machine tolerance in a handful of
 * iterations. Alternatives (fixed-point `E ← M + e·sin(E)`, bisection) either
 * converge only linearly or need a bracket; Newton is both faster and simpler
 * here.
 *
 * WHY only the CPU needs this inverse. The orbit-trail fragment shader never
 * root-finds: it recovers `E` directly from the pixel's plane coordinates via
 * `atan2`, then takes the *forward* Kepler step `M = E − e·sin(E)` to measure
 * trail recency (spec §3.3). Only the CPU-side seed placement — putting each
 * body at its own point on the ellipse from a mean anomaly — needs to go the
 * hard way, `M → E`. Keeping the root-find off the GPU is why this lives in a
 * CPU util rather than the shader.
 *
 * @param meanAnomalyRad  Mean anomaly M in radians (any real value; the result
 *                        follows M's branch — it is not wrapped to [0, 2π)).
 * @param eccentricity    Orbital eccentricity e, in [0, 1). Circular at e = 0.
 * @returns The eccentric anomaly E in radians satisfying `M = E − e·sin(E)`.
 */
export function eccentricAnomalyFromMean(meanAnomalyRad: number, eccentricity: number): number {
  // Seed with E ≈ M + e·sin(M). This is the first-order expansion of the true
  // E about the circular case, a strictly better starting point than the bare
  // E = M for eccentric orbits, so Newton needs one fewer step.
  let eAnom = meanAnomalyRad + eccentricity * Math.sin(meanAnomalyRad);

  // Quadratic convergence reaches double-precision limits well within this cap;
  // the cap only guards against a pathological non-convergence (e very close to
  // 1) rather than being the normal exit — the tolerance break below is.
  const MAX_ITERATIONS = 20;
  const TOLERANCE = 1e-14;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const residual = eAnom - eccentricity * Math.sin(eAnom) - meanAnomalyRad;
    const derivative = 1 - eccentricity * Math.cos(eAnom);
    const step = residual / derivative;
    eAnom -= step;
    if (Math.abs(step) < TOLERANCE) break;
  }

  return eAnom;
}
