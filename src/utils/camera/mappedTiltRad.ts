/** THE display-tilt mapping (rulings 12 + 13, one home), read by BOTH arms so
 * the engage edge changes ownership of the tilt but never the image. */

import type { CameraTuning } from '../../@types/camera/CameraTuning';
import { bodyUpWeight } from './bodyUpWeight';

export function mappedTiltRad(
  rememberedTiltRad: number,
  hOverR: number,
  tuning: CameraTuning,
): number {
  return rememberedTiltRad * bodyUpWeight(hOverR, tuning);
}
