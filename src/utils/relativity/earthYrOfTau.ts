/**
 * earthYrOfTau — Earth-years since launch at ship time `tauYr` on a `distanceLy` trip: the
 * inverse of `shipStateAt(…).tauYr`, t = sinh(a τ)/a per half, mirrored about the midpoint.
 * Clamps to [0, tEarthTotalYr], so a scrub past either end lands on launch or arrival.
 */

import { A_LY_PER_YR2 } from '../../data/relativity/properAccelLyPerYr2';
import { tripOf } from './tripOf';

export function earthYrOfTau(distanceLy: number, tauYr: number): number {
  const { tauTotalYr, tEarthTotalYr } = tripOf(distanceLy);
  if (tauYr <= 0) return 0;
  if (tauYr >= tauTotalYr) return tEarthTotalYr;
  if (tauYr <= tauTotalYr / 2) return Math.sinh(A_LY_PER_YR2 * tauYr) / A_LY_PER_YR2;
  return tEarthTotalYr - Math.sinh(A_LY_PER_YR2 * (tauTotalYr - tauYr)) / A_LY_PER_YR2;
}
