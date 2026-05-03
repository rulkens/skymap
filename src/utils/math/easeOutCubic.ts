/**
 * easeOutCubic — a 0..1 → 0..1 easing curve that decelerates as t approaches 1.
 *
 * ### What is "easing"?
 *
 * A linear tween moves at constant speed: at t=0.5 you're exactly halfway. That
 * feels mechanical because nothing in the physical world starts and stops
 * abruptly — a real camera move accelerates from rest, glides, then settles.
 *
 * Easing functions reshape the linear t into a curve that produces that
 * "natural" feel. `easeOutCubic` is the simplest variant that decelerates near
 * the end:  starts fast, slows down, settles softly.  It is the standard
 * choice for "snap to target" UI animations because the user sees motion
 * start *immediately* (no perceived lag) and finish *gently* (no overshoot).
 *
 * ### The formula
 *
 *     f(t) = 1 - (1 - t)^3
 *
 * Reading it geometrically:
 *   - At t=0:   f = 1 - 1   = 0   (stationary at the start)
 *   - At t=0.5: f = 1 - 1/8 = 7/8 (already 87.5% of the way there)
 *   - At t=1:   f = 1 - 0   = 1   (settled exactly on target)
 *
 * The derivative at t=1 is zero, which is the mathematical statement of
 * "settles softly" — the curve flattens as it touches the top.
 *
 * ### Why clamp?
 *
 * We hand this function the elapsed-time fraction `(now - start) / duration`
 * straight from the render loop.  On a slow frame `now` may overshoot the
 * deadline so the fraction can be slightly above 1; the cube of a value
 * `< 0` is negative, which would flip the curve and overshoot the tween
 * target visibly.  Clamping is one extra `Math.max/min` and removes the bug.
 *
 * @param t  Linear progress in [0, 1].  Values outside the range are clamped.
 * @returns  Eased progress in [0, 1].
 */
export function easeOutCubic(t: number): number {
  // Clamp first — see docstring "Why clamp?" above.
  const clamped = Math.max(0, Math.min(1, t));
  // 1 - (1 - t)^3.  Compute (1 - t) once for clarity and to keep the JIT happy.
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}
