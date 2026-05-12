/**
 * Expected number density of detectable galaxies at distance `dMpc`,
 * given a Schechter luminosity function `(α, M*, φ*)` and a survey
 * flux limit `mLim`.
 *
 * The Schechter LF is
 *
 *     φ(M) dM = 0.4·ln(10)·φ*·[10^(0.4·(M*−M))]^(α+1)·exp(−10^(0.4·(M*−M))) dM
 *
 * which is integrated over `M ∈ [M_min, M_lim − μ(d)]` where μ(d) is
 * the distance modulus and M_min is a deep cut (we use −30 mag, well
 * past the brightest known galaxies; any Schechter density at M=−30
 * is negligible).  Beyond `M_lim − μ(d)` the galaxy is fainter than
 * the survey can see, so it contributes 0 to the *detectable* density.
 *
 * We integrate by simple trapezoidal rule with 200 steps — fast, accurate
 * to 1% for our purposes, no external numerical-integration dependency.
 *
 * The returned density is in galaxies per Mpc³.  The visualisation
 * normalises it relative to the central density and uses the ratio
 * to modulate alpha (so dense regions don't blow out and sparse
 * regions don't vanish).
 */

import { absoluteFromApparent } from './distanceModulus';
import type { SchechterInput } from '../../@types/math/SchechterInput';

// Type moved to `@types/math/SchechterInput`; re-exported so existing
// `import { SchechterInput } from './schechterDensity'` callers keep
// their import line.
export type { SchechterInput };

const LN10 = Math.log(10);

export function expectedNumberDensity(input: SchechterInput): number {
  const { mStar, alpha, phiStar, mLim, dMpc } = input;
  if (dMpc <= 0) return 0;
  const mFaintest = absoluteFromApparent(mLim, dMpc);
  const mBrightCut = -30; // brightest realistic galaxy
  if (mFaintest <= mBrightCut) return 0; // distance so large nothing is detectable

  // Trapezoidal integration over absolute magnitude.
  const N = 200;
  const dM = (mFaintest - mBrightCut) / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const M = mBrightCut + i * dM;
    const x = Math.pow(10, 0.4 * (mStar - M));
    const phi = 0.4 * LN10 * phiStar * Math.pow(x, alpha + 1) * Math.exp(-x);
    const weight = i === 0 || i === N ? 0.5 : 1;
    sum += phi * weight;
  }
  return sum * dM;
}
