/**
 * FitResult — `fitSinusoidSeries`' output, in the plain basis `EphemerisCorrection` stores:
 * cubic coefficients in τ (km) and flat 7-per-term sinusoids (ω rad/day, cos xyz, sin xyz km).
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';

export type FitResult = {
  polyKm: [Vec3, Vec3, Vec3, Vec3];
  terms: number[];
};
