/** bodyUpWeight — BOTH arms' reference-up blend (rulings 8 + 12): 1 = body ENU
 * at `TILT_BAND.fullHR`, 0 = scene up at `zeroHR`, and display tilt is
 * `remembered × this` — so tilt reaching 0 IS the blend reaching scene up. One
 * home for both invariants; `TILT_BAND` keeps `zeroHR ≤ disengageHR` so that
 * still lands at or before the arm flip. */

import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { TILT_BAND } from '../../data/camera/tiltBand';
import { smoothstep } from '../math/smoothstep';

// Two default literals in two files, and the regime's moved twice in nine days.
// Asserted HERE: the records import each other, so neither body sees both.
if (TILT_BAND.zeroHR > SURFACE_REGIME.disengageHR) {
  throw new Error(
    `TILT_BAND.zeroHR ${TILT_BAND.zeroHR} > SURFACE_REGIME.disengageHR ${SURFACE_REGIME.disengageHR}`,
  );
}

export function bodyUpWeight(hOverR: number): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R FALLS; max() guards log(0).
  const { fullHR, zeroHR } = TILT_BAND;
  if (ORIENT_TUNING.blendSpace === 'log') {
    return smoothstep(Math.log(zeroHR), Math.log(fullHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(zeroHR, fullHR, hOverR);
}
