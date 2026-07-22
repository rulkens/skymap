/**
 * moonRatesFromPeriods — convert JPL's satellite period columns into the three
 * per-Julian-century rate fields `OrbitalElements` stores, so a moon advances
 * through the SAME affine map the planets use and `propagateElements` never
 * learns "planet vs moon".
 *
 * ### Periods in, rates out
 *
 * JPL "Planetary Satellite Mean Orbital Parameters" tabulates a precessing mean
 * ellipse as three PERIODS where the planet table gives three RATES:
 *
 * - `periodDays` (P): the mean-anomaly period — the time for M to advance 2π
 *   (periapsis to periapsis; the "anomalistic" period, NOT the sidereal one —
 *   for a fast-precessing moon like Io the two differ by ~0.4%). M always
 *   advances, so `dM/dt = +2π · 36525 / P` per century, always finite and
 *   positive. This reading fits the PLANETARY-SATELLITE rows (Io's listed
 *   1.762732 d is its M-period; its sidereal period is 1.769 d) but NOT the
 *   Moon's row, whose P=27.322 d is the sidereal month — the Moon converts
 *   through `moonRatesFromSiderealPeriods`, which treats 2π/P as the
 *   mean-LONGITUDE rate and derives dM/dt by subtracting both precession
 *   rates. Feeding a sidereal period in HERE double-counts the precessions
 *   into longitude (for the Moon: +0.111°/day, 40.6°/yr of phase drift).
 * - `apsidalPrecessionYears` (Papsis): the period of the argument of periapsis
 *   ω. A prograde satellite's apsis ADVANCES, so `dω/dt = +2π · 100 / Papsis`.
 * - `nodalPrecessionYears` (Pnode): the period of the ascending node Ω. A
 *   prograde satellite's node REGRESSES, so `dΩ/dt = −2π · 100 / Pnode`.
 *
 * Every moon in the scene table is prograde, so those two fixed signs (+apsis,
 * −node) hold for all of them; a retrograde moon (none seeded) would flip both.
 *
 * ### The 0-period sentinel (load-bearing — lives here once, not per row)
 *
 * JPL writes a precession period of `0.000` — or an absurdly tiny one — when it
 * measured NO precession for that element, because the element is geometrically
 * undefined: a node with i ≈ 0 (Io, Enceladus, Dione all list `Pnode = 0.000`),
 * or an apsis with e ≈ 0 (Deimos lists `Papsis = 0.000`; Tethys lists
 * `Papsis = 0.005 yr`, which taken literally is 72000°/yr — a table artifact of
 * a near-circular orbit whose periapsis direction is numerically meaningless).
 * A tiny period must NOT become a huge (or infinite) rate, so below
 * `MIN_PRECESSION_YEARS` the element is treated as non-precessing (rate 0). The
 * error from freezing such a degenerate ω/Ω is bounded by e·a — sub-visual for
 * these near-circular / near-planar orbits. The mean-anomaly period is always
 * well-defined (> 0), so only the two precession terms need the guard.
 */

const TWO_PI = 2 * Math.PI;
const DAYS_PER_JULIAN_CENTURY = 36_525;
const YEARS_PER_JULIAN_CENTURY = 100;

// Below this a JPL precession period signals "no measurable precession" (a
// degenerate node of a near-planar orbit or apsis of a near-circular one) —
// convert it to zero drift, never a divide-by-≈0 blowup.
const MIN_PRECESSION_YEARS = 0.01;

export function moonRatesFromPeriods(periods: {
  periodDays: number;
  apsidalPrecessionYears: number;
  nodalPrecessionYears: number;
}): {
  meanAnomalyRateRadPerCty: number;
  argPeriapsisRateRadPerCty: number;
  ascendingNodeRateRadPerCty: number;
} {
  const precessionRate = (periodYears: number, sign: 1 | -1): number =>
    periodYears > MIN_PRECESSION_YEARS
      ? (sign * TWO_PI * YEARS_PER_JULIAN_CENTURY) / periodYears
      : 0;

  return {
    meanAnomalyRateRadPerCty: (TWO_PI * DAYS_PER_JULIAN_CENTURY) / periods.periodDays,
    argPeriapsisRateRadPerCty: precessionRate(periods.apsidalPrecessionYears, 1),
    ascendingNodeRateRadPerCty: precessionRate(periods.nodalPrecessionYears, -1),
  };
}
