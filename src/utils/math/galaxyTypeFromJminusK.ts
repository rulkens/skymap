/**
 * Coarse galaxy classification from J−K colour index.
 *
 * NIR colours have a much narrower range than optical (~0.7–1.1 across all
 * galaxy types) because the NIR is dominated by old stellar populations even
 * in star-forming galaxies — the hot O/B stars that drive optical blueness
 * contribute relatively little flux at J and K. Thresholds are tighter
 * accordingly: blue/green separation at 0.85, green/red at 1.0.
 *
 * The qualitative description is intentionally vaguer than the optical
 * classifiers because J−K is a weaker discriminator — calling a J−K = 1.05
 * galaxy "passive" with the same confidence as a u−r = 2.5 SDSS galaxy
 * would overstate the certainty. Hence "Redder-than-average" rather than
 * "Red, quiescent".
 */

import type { GalaxyTypeInfo } from '../../@types';

export function galaxyTypeFromJminusK(jk: number): GalaxyTypeInfo {
  if (jk < 0.85) return { category: 'blue', description: 'Bluer-than-average galaxy' };
  if (jk < 1.0) return { category: 'green', description: 'Typical galaxy colour' };
  return { category: 'red', description: 'Redder-than-average galaxy' };
}
