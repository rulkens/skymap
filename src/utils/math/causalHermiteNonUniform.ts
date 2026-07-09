/**
 * causalHermiteNonUniform — evaluate one cubic Hermite segment whose tangents are
 * the BACKWARD (causal) finite differences, with arbitrary knot times.
 *
 * ### Why a causal basis instead of Catmull-Rom
 *
 * `catmullRomNonUniform` sets the tangent at a knot from the CENTRAL difference
 * (the chord through its two neighbours, p2−p0). That makes the curve start
 * banking toward the NEXT knot before it has reached the current one — when the
 * camera aims down its direction of travel, the gaze swings toward the upcoming
 * waypoint while still approaching the present one. A causal basis instead takes
 * the tangent at the arrival knot from the INCOMING chord alone (p2−p1), so the
 * camera reaches a waypoint head-on and the turn toward the next happens only
 * AFTER it — a "fly in straight, then bank away" feel.
 *
 * ### The construction
 *
 * Standard Hermite over the inner pair p1 (at t1) → p2 (at t2), parameter
 * s = (t−t1)/(t2−t1) ∈ [0,1]:
 *
 *     H(s) = h00·p1 + h10·m1 + h01·p2 + h11·m2
 *     h00 = 2s³−3s²+1   h10 = s³−2s²+s   h01 = −2s³+3s²   h11 = s³−s²
 *
 * The tangents are the one-sided (backward) velocities, expressed w.r.t. the
 * LOCAL parameter s (hence the ·(t2−t1) chain-rule factor), then scaled by
 * `turnDelay`:
 *
 *     m1 = turnDelay · (p1−p0)/(t1−t0) · (t2−t1)   (departure: prior incoming chord)
 *     m2 = turnDelay · (p2−p1)                      (arrival: this incoming chord)
 *
 * Because m2 ignores p3 entirely, the segment is INDEPENDENT of the forward knot
 * — the defining causal property. `turnDelay` is the turn-delay / overshoot knob:
 * 1 is the natural chord-magnitude tangent, 0 collapses both tangents to zero
 * (a plain smoothstep that eases to rest at each knot), and >1 shoots further
 * along the chord before banking (more overshoot on a sharp corner).
 *
 * `t` is the GLOBAL parameter and must lie in [t1, t2]. p3/t3 are accepted only
 * to share a uniform basis-function signature with `catmullRomNonUniform` (so the
 * spline dispatch in `buildPathTrack` reads the same 4-knot window either way);
 * they do not influence the result.
 *
 * Denominators are floored to avoid a divide-by-zero on a degenerate
 * (zero-length) leg, keeping the result finite without affecting well-separated
 * knots.
 */

const EPS = 1e-12;

export function causalHermiteNonUniform(
  p0: number,
  p1: number,
  p2: number,
  _p3: number,
  t0: number,
  t1: number,
  t2: number,
  _t3: number,
  t: number,
  turnDelay: number,
): number {
  const h = t2 - t1;
  if (Math.abs(h) < EPS) return p1; // coincident inner knots → hold the left value
  const s = (t - t1) / h;

  const dPrev = t1 - t0;
  // Departure tangent (local-s): prior incoming chord velocity · segment width.
  const m1 = Math.abs(dPrev) < EPS ? 0 : turnDelay * ((p1 - p0) / dPrev) * h;
  // Arrival tangent (local-s): this incoming chord, head-on; (p2−p1)/h · h = (p2−p1).
  const m2 = turnDelay * (p2 - p1);

  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
}
