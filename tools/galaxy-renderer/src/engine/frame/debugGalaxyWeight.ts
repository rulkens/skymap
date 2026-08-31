/**
 * debugGalaxyWeight — combined dimming weight for the galaxy under the debug
 * views. They crossfade INDEPENDENTLY rather than replace the galaxy, so this
 * is 1 minus the LARGEST weight, not the sum: summing would double-dim the
 * galaxy wherever two views are live at once.
 */
import type { DebugViewWeights } from '../../../../../src/@types/galaxy/DebugViewWeights';

export function debugGalaxyWeight(views: DebugViewWeights): number {
  return Math.max(0, 1 - Math.max(...Object.values(views)));
}
