/**
 * bodyUpWeight — the engaged settle's reference-up blend weight (ruling 8,
 * round 5): 1 = pure body ENU at/below `engageHR`, 0 = pure scene up at/above
 * `disengageHR`. The band IS the hysteresis window — the altitude range the
 * body arm owns during a recession — so a disengaging pose is scene-aligned
 * by construction. One home; the settle never restates the edges.
 */

import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R falls (same
  // descending-ramp convention as maxTiltRad).
  return smoothstep(SURFACE_REGIME.disengageHR, SURFACE_REGIME.engageHR, hOverR);
}
