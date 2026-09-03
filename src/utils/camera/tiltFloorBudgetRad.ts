/**
 * tiltFloorBudgetRad — how much tilt-lowering rotation (about `eastAxis`,
 * through `anchorM`) a pose can spend before its displayed tilt crosses 0:
 * ruling 14's floor. NOT the tilt itself — the anchor pivot drags the local
 * up along, so the through-zero rotation is larger by ~1 + h/R (R13-1).
 * Closed form: tilt 0 ⇔ the east component of forward′ × eye′ vanishes, and
 * under a rotation by t that component is exactly `P·cos t − Q·sin t + K`.
 * Returns 0 when the pose is already at/past the floor, Infinity when no
 * rotation about this axis reaches it (no crossing possible, nothing to cap).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';

function dotWith(v: Readonly<Vec3>, w: Readonly<Vec3>): number {
  return v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
}

export function tiltFloorBudgetRad(
  forward: Readonly<Vec3>,
  eyeM: Readonly<Vec3>,
  anchorM: Readonly<Vec3>,
  eastAxis: Readonly<Vec3>,
): number {
  const rel: Vec3 = [eyeM[0] - anchorM[0], eyeM[1] - anchorM[1], eyeM[2] - anchorM[2]];
  const p = dotWith(cross3(forward, anchorM), eastAxis);
  const k = dotWith(cross3(forward, rel), eastAxis);
  if (p + k <= 0) return 0; // p + k is the measure at t = 0: at/past the floor
  const q = dotWith(forward, anchorM);
  const m = Math.hypot(p, q);
  const c = -k / m;
  if (Math.abs(c) > 1) return Infinity;
  const a = Math.acos(c);
  const phi = Math.atan2(q, p);
  // Two root families per turn; the budget is the one nearest below 0.
  const wrap = (t: number): number => (t > 0 ? t - 2 * Math.PI : t);
  const root = Math.max(wrap(a - phi), wrap(-a - phi));
  // A sub-fp-noise root is the just-landed pose re-read: the budget is spent.
  return root > -1e-12 ? 0 : -root;
}
