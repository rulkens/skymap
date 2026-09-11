/** bodyUpWeight — BOTH arms' reference-up blend (rulings 8 + 12): 1 = body ENU
 * at `tiltFullHR`, 0 = scene up at `tiltZeroHR`, and display tilt is
 * `remembered × this` — so tilt reaching 0 IS the blend reaching scene up. */

import type { CameraTuning } from '../../@types/camera/CameraTuning';
import { smoothstep } from '../math/smoothstep';

export function bodyUpWeight(hOverR: number, tuning: CameraTuning): number {
  // edge0 > edge1 is deliberate: the weight opens as h/R FALLS; max() guards log(0).
  const { tiltFullHR, tiltZeroHR } = tuning;
  if (tuning.blendSpace === 'log') {
    return smoothstep(Math.log(tiltZeroHR), Math.log(tiltFullHR), Math.log(Math.max(hOverR, 1e-9)));
  }
  return smoothstep(tiltZeroHR, tiltFullHR, hOverR);
}
