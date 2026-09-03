/**
 * unmappedTiltRad — the inverse of `mappedTiltRad`, kept beside it so the
 * forward map and its un-map can never silently diverge (R12-2): the inverse
 * writes the remembered-tilt MEMORY, so a fork here would be sticky. Callers
 * guard the degenerate weight (w → 0) — the ratio diverges there and no
 * intent is readable from the display.
 */

import { bodyUpWeight } from './bodyUpWeight';

export function unmappedTiltRad(displayTiltRad: number, hOverR: number): number {
  return displayTiltRad / bodyUpWeight(hOverR);
}
