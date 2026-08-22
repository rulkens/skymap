/**
 * shortestAngleDelta — the unique signed angle in [−π, +π) that, added to `a`,
 * lands on the same point of the circle as `b`.
 *
 *     ((b − a + π) mod 2π) − π   — with JS's sign-keeping `%` fixed by the
 *     standard `((x % m) + m) % m`, or a negative `b − a` folds the wrong way.
 *
 * Two sites need "the representative of `b` nearest `a`", and yaw is stored as
 * an unbounded float that a long drag can wind many turns out: `lerpAngleShortest`
 * (don't tween the long way round) and `surfaceDragRotation` (don't accept a
 * root on a branch the camera isn't on).
 */

export function shortestAngleDelta(a: number, b: number): number {
  const TAU = Math.PI * 2;
  const folded = (((b - a + Math.PI) % TAU) + TAU) % TAU;
  return folded - Math.PI;
}
