/** bodyUpWeight — BOTH arms' reference-up blend (rulings 8 + 12): 1 = body ENU
 * at `TILT_BAND.fullHR`, 0 = scene up at `zeroHR`, and display tilt is
 * `remembered × this` — so tilt reaching 0 IS the blend reaching scene up. One
 * home for both invariants; `TILT_BAND` keeps `zeroHR ≤ disengageHR` so that
 * still lands at or before the arm flip. */

import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { TILT_BAND } from '../../data/camera/tiltBand';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R FALLS; max() guards log(0).
  const { fullHR, zeroHR } = TILT_BAND;
  if (ORIENT_TUNING.blendSpace === 'log') {
    return smoothstep(Math.log(zeroHR), Math.log(fullHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(zeroHR, fullHR, hOverR);
}
