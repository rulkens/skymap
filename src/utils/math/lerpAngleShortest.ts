/**
 * lerpAngleShortest — interpolate between two radian angles along the SHORT arc.
 *
 * Yaw is stored as a float that grows without bound — a few drag revolutions
 * leave you at yaw = 12.7 rad while the camera visually points where yaw = 0.13
 * does. A naive `lerp(12.7, 0.3, t)` then sweeps the camera backward through
 * almost two full revolutions of pointless spin. `shortestAngleDelta` picks the
 * representative of `b` nearest `a` (the formula lives there); this walks to it.
 *
 * Pitch never needs the same treatment — it is clamped to ±(π/2 − ε) and cannot
 * wrap.
 *
 * @param a  Start angle in radians. May be any real number.
 * @param b  End angle in radians. May be any real number.
 * @param t  Interpolation parameter, 0..1.
 */

import { shortestAngleDelta } from './shortestAngleDelta';

export function lerpAngleShortest(a: number, b: number, t: number): number {
  return a + shortestAngleDelta(a, b) * t;
}
