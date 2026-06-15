/**
 * Combine the procedural impostor's bulge and disk components with
 * caller-supplied weights.
 *
 * Typical weights for a Sb spiral would be `bulgeWeight=0.5,
 * diskWeight=0.5`; an Sa-type galaxy with a strong bulge might use
 * `0.7 / 0.3`; an Sd with no significant bulge would use `0.2 / 0.8` or
 * even `0.0 / 1.0`.  The current impostor uses a single fixed `0.6 / 0.4`
 * blend everywhere; per-galaxy Hubble-type dispatch is future work (the
 * type strings are sparse outside Famous + a few catalog rows).
 *
 * Returns values in [0, bulgeWeight + diskWeight] (typically [0, 1] when
 * the weights sum to 1).
 */

import { bulgeBrightness } from './bulgeBrightness';
import { diskBrightness } from './diskBrightness';

export function combinedBrightness(r: number, bulgeWeight: number, diskWeight: number): number {
  return bulgeBrightness(r) * bulgeWeight + diskBrightness(r) * diskWeight;
}
