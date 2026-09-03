/**
 * mappedTiltRad — THE display-tilt mapping (rulings 12 + 13, one home):
 * `remembered × bodyUpWeight(h/R)` — the remembered value below the band,
 * lerping to exactly 0 at disengage on the same band record and blend space
 * as every other orientation authority. Read by BOTH arms (the engaged zoom
 * settle and the world arm's in-window approach expression), so the engage
 * edge can change ownership but never the image.
 */

import { bodyUpWeight } from './bodyUpWeight';

export function mappedTiltRad(rememberedTiltRad: number, hOverR: number): number {
  return rememberedTiltRad * bodyUpWeight(hOverR);
}
