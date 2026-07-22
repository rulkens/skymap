/**
 * moonRatesFromSiderealPeriods — convert a satellite row whose tabulated
 * period is the SIDEREAL one (the Moon's row) into the three per-Julian-century
 * rate fields `OrbitalElements` stores, keeping `propagateElements` one
 * branch-free affine map.
 *
 * ### Why a second converter exists at all
 *
 * `moonRatesFromPeriods` reads JPL's `P` column as the MEAN-ANOMALY period
 * (`dM/dt = 2π/P`), which is what the planetary-satellite rows tabulate — Io's
 * listed 1.762732 d is its M-period, not its 1.769 d sidereal period. But the
 * Moon's row lists `P = 27.322 d`, the famous SIDEREAL month; its mean-anomaly
 * (anomalistic) month is 27.5545 d. Feeding a sidereal period through the
 * anomalistic converter silently double-counts the precessions into longitude:
 * the mean longitude is `λ = Ω + ω + M`, so with `dM/dt = 2π/P_sid` PLUS the
 * apsidal and nodal rates advancing ω and Ω, λ runs fast by exactly
 * `dϖ/dt = +0.111°/day` — a 40.6°/yr phase drift that carried the sim Moon
 * 102° away from the Sun during the real 2024-04-08 total eclipse.
 *
 * The alternative — authoring the Moon row with the derived 27.5545 d so the
 * anomalistic converter applies — would break the table's transcription
 * discipline (every row carries JPL's columns verbatim). Instead this variant
 * makes the interpretation explicit: `2π/P` is the LONGITUDE rate, and the
 * mean-anomaly rate is what remains after the precessions take their share:
 *
 *     dλ/dt = 2π/P_sid            (sidereal: one full λ-revolution per P)
 *     dM/dt = dλ/dt − dω/dt − dΩ/dt
 *
 * For the Moon that lands on 13.0650°/day — the 27.5545 d anomalistic month —
 * without 27.5545 ever appearing as a magic number.
 *
 * ### Composition, not duplication
 *
 * The precession-rate conversion (signs, the 0-period degeneracy sentinel)
 * already lives in `moonRatesFromPeriods`; this variant delegates to it and
 * only replaces the mean-anomaly rate, so the two converters cannot drift
 * apart on the parts they share.
 */

import { moonRatesFromPeriods } from './moonRatesFromPeriods';

const TWO_PI = 2 * Math.PI;
const DAYS_PER_JULIAN_CENTURY = 36_525;

export function moonRatesFromSiderealPeriods(periods: {
  siderealPeriodDays: number;
  apsidalPrecessionYears: number;
  nodalPrecessionYears: number;
}): {
  meanAnomalyRateRadPerCty: number;
  argPeriapsisRateRadPerCty: number;
  ascendingNodeRateRadPerCty: number;
} {
  const rates = moonRatesFromPeriods({
    periodDays: periods.siderealPeriodDays,
    apsidalPrecessionYears: periods.apsidalPrecessionYears,
    nodalPrecessionYears: periods.nodalPrecessionYears,
  });

  const meanLongitudeRateRadPerCty =
    (TWO_PI * DAYS_PER_JULIAN_CENTURY) / periods.siderealPeriodDays;

  return {
    ...rates,
    meanAnomalyRateRadPerCty:
      meanLongitudeRateRadPerCty -
      rates.argPeriapsisRateRadPerCty -
      rates.ascendingNodeRateRadPerCty,
  };
}
