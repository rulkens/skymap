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

import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R falls (same
  // descending-ramp convention as maxTiltRad).
  return smoothstep(SURFACE_REGIME.disengageHR, SURFACE_REGIME.engageHR, hOverR);
}
