/** Inverse of `mappedTiltRad`, beside it so map and un-map cannot diverge
 * (R12-2) — this one writes the MEMORY. Callers guard w → 0, where it blows up. */

import type { CameraTuning } from '../../@types/camera/CameraTuning';
import { bodyUpWeight } from './bodyUpWeight';

export function unmappedTiltRad(
  displayTiltRad: number,
  hOverR: number,
  tuning: CameraTuning,
): number {
  return displayTiltRad / bodyUpWeight(hOverR, tuning);
}
