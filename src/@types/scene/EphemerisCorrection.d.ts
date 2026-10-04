/**
 * EphemerisCorrection — one planet's fitted `Horizons − Kepler` residual over a span,
 * in km: a cubic in normalised time plus a sum of sinusoids. `ephemerisCorrectionMpc`
 * evaluates it; `tools/bodies/buildPlanetEphemeris.ts` generates it. Outside the span
 * the edge value is held (simDays is clamped), so dates past either end stay finite.
 */

import type { Vec3 } from '../math/Vec3';

export type EphemerisCorrection = {
  /** Fitted span start, UTC Julian date. */
  readonly startJd: number;
  /** Fitted span end, UTC Julian date. */
  readonly endJd: number;
  /** Coefficients of τ⁰..τ³ in km, τ = 2(t − startJd)/(endJd − startJd) − 1. */
  readonly polyKm: readonly [Vec3, Vec3, Vec3, Vec3];
  /** Flat, 7 per term: ω (rad/day), cos x,y,z (km), sin x,y,z (km); phase ω·(t − startJd). */
  readonly terms: readonly number[];
};
