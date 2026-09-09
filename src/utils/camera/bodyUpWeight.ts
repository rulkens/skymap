/**
 * bodyUpWeight — BOTH arms' reference-up blend weight (rulings 8 + 10): 1 =
 * pure body ENU at/below `engageHR`, 0 = pure scene up at/above `disengageHR`.
 * The band IS the hysteresis window, so a disengaging pose is scene-aligned by
 * construction and the engage-flip pop is unrepresentable. One home.
 *
 * Double duty (ruling 12): display tilt is `remembered × THIS weight`, so tilt
 * landing at exactly 0 at disengage is the same fact as the blend reaching the
 * scene up — one curve carries both invariants.
 */

import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R falls (the same
  // descending-ramp convention as maxTiltRad). In 'log' space the smoothstep
  // runs over log(h/R) — same edges, half-weight at the geometric midpoint,
  // because zoom notches are multiplicative; max() guards log(0) at the surface.
  const { engageHR, disengageHR } = SURFACE_REGIME;
  if (ORIENT_TUNING.blendSpace === 'log') {
    return smoothstep(Math.log(disengageHR), Math.log(engageHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(disengageHR, engageHR, hOverR);
}
