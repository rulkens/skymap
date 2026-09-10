/** bodyUpWeight — BOTH arms' reference-up blend (rulings 8 + 10 + 12): 1 = body
 * ENU at `engageHR`, 0 = scene up at `disengageHR`, and display tilt is
 * `remembered × this` — so tilt reaching 0 at disengage IS the blend reaching
 * scene up. One home for both invariants. */

import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R FALLS; max() guards log(0).
  const { engageHR, disengageHR } = SURFACE_REGIME;
  if (ORIENT_TUNING.blendSpace === 'log') {
    return smoothstep(Math.log(disengageHR), Math.log(engageHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(disengageHR, engageHR, hOverR);
}
