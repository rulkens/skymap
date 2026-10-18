/**
 * tripOf — a 1 g flip-and-burn trip of `distanceLy`: accelerate to the midpoint, decelerate to rest.
 * Hyperbolic motion gives x = (γ − 1)/a per half, so γ_max = 1 + a·d/2; then τ = acosh(γ)/a and
 * t = √(γ² − 1)/a per half. Units: years, light-years, c = 1.
 */

import type { TripSummary } from '../../@types/relativity/TripSummary';
import { A_LY_PER_YR2 } from '../../data/relativity/properAccelLyPerYr2';

export function tripOf(distanceLy: number): TripSummary {
  const gammaMax = 1 + (A_LY_PER_YR2 * distanceLy) / 2;
  return {
    tauTotalYr: (2 * Math.acosh(gammaMax)) / A_LY_PER_YR2,
    tEarthTotalYr: (2 * Math.sqrt(gammaMax * gammaMax - 1)) / A_LY_PER_YR2,
    gammaMax,
  };
}
