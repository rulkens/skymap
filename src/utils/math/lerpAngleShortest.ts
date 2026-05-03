/**
 * lerpAngleShortest — interpolate between two radian angles along the SHORT arc.
 *
 * ### Why scalar `lerp` is wrong for angles
 *
 * Yaw is stored as a float that grows without bound — drag-rotating a few
 * times can leave you at yaw = 12.7 rad even though the camera is visually
 * pointing the same way as yaw = 0.13.  If the user clicks "Focus" on a
 * galaxy whose computed target yaw is 0.3, a naive `lerp(12.7, 0.3, t)`
 * would sweep the camera *backward* through every angle from 12.7 down to
 * 0.3 — over 12 radians (almost two full revolutions) of pointless spin.
 *
 * What we actually want is "go the short way": find the equivalent angle of
 * `b` that sits within ±π of `a`, then linearly interpolate to it.  Mod-2π
 * gives infinitely many equivalent representations; the *shortest signed
 * delta* between two angles is the unique one in (−π, +π].
 *
 * ### The shortest-arc formula
 *
 *     delta = ((b - a + π) mod 2π) - π
 *
 * Reading right-to-left:
 *
 *   1. `b - a`           — naive raw difference (could be ±anything).
 *   2. `... + π`         — shift the wrap point so the desired range becomes [0, 2π).
 *   3. `mod 2π`          — fold into the principal range [0, 2π).
 *   4. `... - π`         — shift back so the result lives in [−π, +π).
 *
 * (Note: JavaScript's `%` is "truncated remainder", not "modulo" — for
 * negative values it returns a negative remainder.  We fix that with the
 * standard `((x % m) + m) % m` trick to get a true non-negative modulo.)
 *
 * Result: `delta` is the unique signed angle in (−π, +π] that, added to
 * `a`, lands on the same point as `b` on the unit circle.  Then a normal
 * scalar lerp `a + delta * t` walks the short way around.
 *
 * ### Why this matters for camera tweens
 *
 * Yaw is the only angular state we tween (pitch is clamped to ±(π/2 − ε) and
 * never wraps).  Without shortest-arc, returning to home (yaw=0) from a
 * heavily-rotated state produces a comically long backwards spin.  This is
 * the kind of subtle bug worth a learning moment in a comment.
 *
 * @param a  Start angle in radians.  May be any real number.
 * @param b  End angle in radians.  May be any real number.
 * @param t  Interpolation parameter, 0..1.
 * @returns  An angle that smoothly walks from `a` toward `b` along the short arc.
 */
export function lerpAngleShortest(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  // Raw difference, which we will fold into (-π, +π].
  const raw = b - a + Math.PI;
  // True (non-negative) modulo: JS's `%` keeps the sign of the dividend, so
  //   (-0.1) % 6.28  === -0.1   (not 6.18, which is what we want).
  // The standard fix is `((x % m) + m) % m`.
  const folded = ((raw % TAU) + TAU) % TAU;
  // Shift back so [0, 2π) becomes [-π, +π) — the short signed arc.
  const delta = folded - Math.PI;
  return a + delta * t;
}
