/**
 * shipStateAt — the 1 g ship `earthYr` Earth-years after launch on a `distanceLy` trip. Closed
 * form in Earth time t, so nothing is integrated: γ = √(1 + (a t)²), β = a t / γ, x = (γ − 1)/a,
 * τ = asinh(a t)/a. The decelerating half is the same curve run backwards from arrival, keyed
 * on the Earth time remaining. Before launch the ship sits at the start; past arrival it rests
 * at `distanceLy` with γ = 1.
 */

import type { ShipState } from '../../@types/relativity/ShipState';
import { A_LY_PER_YR2 } from '../../data/relativity/properAccelLyPerYr2';
import { tripOf } from './tripOf';

export function shipStateAt(distanceLy: number, earthYr: number): ShipState {
  const { tauTotalYr, tEarthTotalYr } = tripOf(distanceLy);
  if (earthYr <= 0) return { tauYr: 0, xLy: 0, beta: 0, gamma: 1, phase: 'accelerating' };
  if (earthYr >= tEarthTotalYr) {
    return { tauYr: tauTotalYr, xLy: distanceLy, beta: 0, gamma: 1, phase: 'arrived' };
  }
  const accelerating = earthYr <= tEarthTotalYr / 2;
  const at = A_LY_PER_YR2 * (accelerating ? earthYr : tEarthTotalYr - earthYr);
  const gamma = Math.sqrt(1 + at * at);
  const xHalfLy = (gamma - 1) / A_LY_PER_YR2;
  const tauHalfYr = Math.asinh(at) / A_LY_PER_YR2;
  return accelerating
    ? { tauYr: tauHalfYr, xLy: xHalfLy, beta: at / gamma, gamma, phase: 'accelerating' }
    : {
        tauYr: tauTotalYr - tauHalfYr,
        xLy: distanceLy - xHalfLy,
        beta: at / gamma,
        gamma,
        phase: 'decelerating',
      };
}
