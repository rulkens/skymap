/**
 * dominantArms — the arm harmonic (m = 1..6) with the largest magnitude in a
 * descriptor, for reporting. Ported verbatim from the spike's `galaxy-matcher.js`.
 * The seed (best=2, bv=-1) is overwritten by any non-negative magnitude at
 * m=1, so flat spectra return 1; ties break to the lowest harmonic.
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
