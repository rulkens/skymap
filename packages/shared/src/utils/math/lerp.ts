/**
 * lerp — pure scalar linear interpolation between `a` and `b` at parameter `t`.
 *
 * ### The formula and why we write it this way
 *
 * The textbook expression is `a + (b - a) * t`.  An equally valid form is
 * `a * (1 - t) + b * t` ("convex combination" form).  For finite `a, b` and
 * `t ∈ [0, 1]` they produce identical results, but they differ in two
 * practical respects:
 *
 *   1. The convex form is the *correct* one when `a` and `b` are very large
 *      and very different magnitudes — `(b - a)` can lose precision while
 *      `a*(1-t) + b*t` keeps each term scaled.  This matters in camera tweens
 *      where coordinates can be in the millions of Mpc.
 *   2. The convex form composes nicely with the boundary cases:  at `t=1` we
 *      get exactly `b` (no `a + (b - a)` rounding ricochet), and at `t=0`
 *      we get exactly `a`.  Tests that assert `lerp(a, b, 1) === b` rely on
 *      this exactness.
 *
 * We use the convex form for both reasons.
 *
 * ### Why no clamping?
 *
 * Some callers want to extrapolate (springs, overshoot, parallax beyond
 * endpoints).  Easing curves should clamp; arithmetic primitives shouldn't.
 *
 * @param a  Start value (returned at t=0).
 * @param b  End value (returned at t=1).
 * @param t  Interpolation parameter.  Inside [0, 1] interpolates; outside extrapolates.
 * @returns  The interpolated scalar.
 */
export function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}
