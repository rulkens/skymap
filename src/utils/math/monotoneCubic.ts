/**
 * monotoneCubic — build a monotone cubic Hermite interpolant through knots
 * `(xs[i], ys[i])`, returning a function `x → y`.
 *
 * Used as the `flyPath` timing curve: `xs` are the cumulative leg times, `ys`
 * the matching cumulative arc-fractions. Evaluating it maps elapsed time to
 * progress along the path. Two properties make a plain cubic (e.g. Catmull-Rom)
 * unsuitable and this one correct:
 *
 *   - **Interpolating** — passes exactly through each knot, so the camera is at
 *     waypoint `i` precisely at its scheduled time.
 *   - **Monotone** — never decreases between knots. A Catmull-Rom timing curve
 *     can overshoot a knot and dip back, which would slide the camera BACKWARD
 *     along the path mid-flight — a visible glitch. The Fritsch–Carlson tangent
 *     limiter (below) clamps the Hermite tangents into the region that
 *     guarantees monotonicity for monotone input data.
 *
 * Outside `[xs[0], xs[last]]` the result is clamped to the endpoint value
 * (no extrapolation) — a tour clock never runs a path past its own window, and
 * clamping is the safe default if it briefly does.
 *
 * `xs` must be strictly increasing with `xs.length === ys.length >= 2`.
 *
 * Reference: Fritsch & Carlson, "Monotone Piecewise Cubic Interpolation",
 * SIAM J. Numer. Anal. 17 (1980).
 */

export function monotoneCubic(
  xs: readonly number[],
  ys: readonly number[],
): (x: number) => number {
  const n = xs.length;

  // Secant slopes between consecutive knots.
  const delta: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!);
  }

  // Initial tangents: average of neighbouring secants (one-sided at the ends).
  const m: number[] = new Array(n);
  m[0] = delta[0]!;
  m[n - 1] = delta[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    // A local extremum (secants change sign, or either is flat) pins the tangent
    // to zero so the curve flattens at the knot rather than overshooting.
    if (delta[i - 1]! * delta[i]! <= 0) {
      m[i] = 0;
    } else {
      m[i] = (delta[i - 1]! + delta[i]!) / 2;
    }
  }

  // Fritsch–Carlson limiter: shrink any tangent pair that leaves the
  // monotonicity circle (α² + β² ≤ 9) back onto it.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i]! / delta[i]!;
    const beta = m[i + 1]! / delta[i]!;
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * delta[i]!;
      m[i + 1] = tau * beta * delta[i]!;
    }
  }

  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;

    // Locate the segment [xs[i], xs[i+1]] containing x (linear scan — n is small).
    let i = 0;
    while (i < n - 1 && x > xs[i + 1]!) i++;

    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Cubic Hermite basis.
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * ys[i]! + h10 * h * m[i]! + h01 * ys[i + 1]! + h11 * h * m[i + 1]!;
  };
}
