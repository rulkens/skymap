/**
 * catmullRomNonUniform — evaluate one Catmull-Rom segment with ARBITRARY knot
 * times, using the Barry-Goldman pyramidal (recursive lerp) formulation.
 *
 * The uniform `catmullRom` bakes in evenly-spaced knots (times 0,1,2,3). That is
 * what makes it OVERSHOOT and form loops when the control points are unevenly
 * spaced — a far neighbour yanks the tangent at a knot far out of proportion to
 * the local segment. Centripetal (α=0.5) Catmull-Rom fixes that by spacing the
 * knot TIMES by chord-length^α, which provably never cusps or self-intersects.
 * But to honour those non-uniform times you cannot use the uniform basis; you
 * need this generalised evaluator.
 *
 * The Barry-Goldman construction is three nested linear interpolations:
 *
 *     A1 = lerp(p0, p1) over [t0,t1]      A2 = lerp(p1, p2) over [t1,t2]      A3 = lerp(p2, p3) over [t2,t3]
 *     B1 = lerp(A1, A2) over [t0,t2]      B2 = lerp(A2, A3) over [t1,t3]
 *     C  = lerp(B1, B2) over [t1,t2]
 *
 * It evaluates the segment between knots 1 and 2 (the inner pair); knots 0 and 3
 * only set the tangents. `t` is the GLOBAL parameter and must lie in [t1, t2].
 *
 * Denominators are floored to avoid a divide-by-zero when two knot times
 * coincide (a degenerate, zero-length leg); the floor keeps the result finite
 * without affecting well-separated knots.
 */

const EPS = 1e-12;

function lerpAt(a: number, b: number, ta: number, tb: number, t: number): number {
  const d = tb - ta;
  if (Math.abs(d) < EPS) return a; // coincident knots → hold the left value
  const f = (t - ta) / d;
  return a + (b - a) * f;
}

export function catmullRomNonUniform(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): number {
  const a1 = lerpAt(p0, p1, t0, t1, t);
  const a2 = lerpAt(p1, p2, t1, t2, t);
  const a3 = lerpAt(p2, p3, t2, t3, t);
  const b1 = lerpAt(a1, a2, t0, t2, t);
  const b2 = lerpAt(a2, a3, t1, t3, t);
  return lerpAt(b1, b2, t1, t2, t);
}
