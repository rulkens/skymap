/**
 * dominantArms — the arm harmonic (m = 1..6) with the largest magnitude in a
 * descriptor, for reporting. Ported verbatim from galaxy-matcher.js:124-128.
 * Defaults to 2 (the most common spiral arm count) when no harmonic stands
 * out, matching the seed value in the original scan.
 */
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';

export function dominantArms(d: GalaxyDescriptor): number {
  let best = 2,
    bv = -1;
  for (let m = 1; m <= 6; m++)
    if (d.arm[m - 1]! > bv) {
      bv = d.arm[m - 1]!;
      best = m;
    }
  return best;
}
