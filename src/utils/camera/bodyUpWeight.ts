/**
 * bodyUpWeight — BOTH arms' reference-up blend weight (rulings 8 + 10):
 * 1 = pure body ENU at/below `engageHR`, 0 = pure scene up at/above
 * `disengageHR`. The band IS the hysteresis window — the altitude range the
 * body arm owns during a recession — so a disengaging pose is scene-aligned
 * by construction, and the world arm's roll target agrees with the engaged
 * reference at every altitude (the engage-flip pop is unrepresentable).
 * One home; no consumer restates the edges.
 *
 * Load-bearing partner: the recession tilt wall (`canonicalledPose`) lands
 * tilt 0 at disengage, which makes the image plane the horizontal plane there
 * — without it the scene-aligned "north" would not be the screen-up the fold
 * bakes.
 */

import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R falls (same
  // descending-ramp convention as maxTiltRad). In 'log' space (ruling 11
  // trial) the same smoothstep runs over log(h/R) — same edges, half-weight
  // at the geometric midpoint, because zoom notches are multiplicative. The
  // max() guards an at-surface pose against log(0).
  const { engageHR, disengageHR } = SURFACE_REGIME;
  if (ORIENT_TUNING.blendSpace === 'log') {
    return smoothstep(Math.log(disengageHR), Math.log(engageHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(disengageHR, engageHR, hOverR);
}
