/** THE display-tilt mapping (rulings 12 + 13, one home), read by BOTH arms so
 * the engage edge changes ownership of the tilt but never the image. */

import { bodyUpWeight } from './bodyUpWeight';

export function mappedTiltRad(rememberedTiltRad: number, hOverR: number): number {
  return rememberedTiltRad * bodyUpWeight(hOverR);
}
