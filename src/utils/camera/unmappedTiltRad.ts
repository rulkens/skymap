/**
 * The inverse of `mappedTiltRad`, kept beside it so the map and its un-map
 * cannot silently diverge (R12-2) — the inverse writes the remembered-tilt
 * MEMORY, so a fork here would be sticky. Callers guard the degenerate weight
 * (w → 0), where the ratio diverges.
 */

import { bodyUpWeight } from './bodyUpWeight';

export function unmappedTiltRad(displayTiltRad: number, hOverR: number): number {
  return displayTiltRad / bodyUpWeight(hOverR);
}
