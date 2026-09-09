/**
 * mappedTiltRad — THE display-tilt mapping (rulings 12 + 13, one home):
 * `remembered × bodyUpWeight(h/R)`, reaching exactly 0 at disengage on the same
 * band record as every other orientation authority. Read by BOTH arms, so the
 * engage edge can change ownership but never the image.
 */

import { bodyUpWeight } from './bodyUpWeight';

export function mappedTiltRad(rememberedTiltRad: number, hOverR: number): number {
  return rememberedTiltRad * bodyUpWeight(hOverR);
}
