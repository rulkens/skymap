/**
 * propagateElements — advance a body's classical Keplerian elements from their
 * J2000 epoch to a simulated instant, as one linear (affine) map.
 *
 * ### One propagation path for every body
 *
 * JPL's "Approximate Positions of the Major Planets" models each element as a
 * straight line in time: `element(T) = element₀ + rate · T`, where `T` is the
 * number of Julian centuries elapsed since J2000. That is the whole ephemeris
 * this scene needs — no per-planet special case, no distinction between planets
 * and moons. Every animated row carries the SAME six per-century rate fields
 * (Task 5's satellite maker converts JPL's period/precession columns INTO these
 * same fields), so this function never learns "planet vs moon": it is a single
 * affine map over whatever rates a row happens to carry. A row with no rate for
 * a field leaves that field untouched — a static body propagates to itself,
 * which is why the rate fields are optional and a missing rate reads as zero.
 *
 * ### Absolute in `simDays`, not composable
 *
 * The result is the element set AT `simDays`, computed from the epoch elements
 * and the elapsed centuries — it is NOT a delta to be chained. Feeding this
 * function's output back into it would double-count the epoch offset; always
 * propagate from the original epoch elements. (The returned object keeps its
 * rate fields so it can be re-propagated from the epoch, not stepped.)
 *
 * Non-classical fields (`id`, `focusId`, `plane`, `color`) carry over
 * unchanged — they describe the orbit's identity and frame, not its state.
 *
 * @param elements  The body's J2000 classical elements plus optional rates.
 * @param simDays   The simulated instant as a Julian Date (e.g. `2451545.0` is
 *                  J2000; the classical fields then equal their epoch values).
 * @returns A new `OrbitalElements` with each classical field advanced by
 *          `rate · T`, where `T = (simDays − 2451545.0) / 36525`.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import { CONST_J2000 } from '../../data/time/constJ2000';

// The length of a Julian century in days — with `CONST_J2000` (the J2000.0
// epoch), the pair that turns a Julian Date into "centuries since J2000".
const DAYS_PER_JULIAN_CENTURY = 36_525;

export function propagateElements(elements: OrbitalElements, simDays: number): OrbitalElements {
  const centuriesSinceEpoch = (simDays - CONST_J2000) / DAYS_PER_JULIAN_CENTURY;

  // A missing rate contributes no drift, so a static body propagates to itself.
  const advance = (value: number, ratePerCty: number | undefined): number =>
    value + (ratePerCty ?? 0) * centuriesSinceEpoch;

  return {
    ...elements,
    semiMajorMpc: advance(elements.semiMajorMpc, elements.semiMajorRateMpcPerCty),
    eccentricity: advance(elements.eccentricity, elements.eccentricityRatePerCty),
    inclinationRad: advance(elements.inclinationRad, elements.inclinationRateRadPerCty),
    ascendingNodeRad: advance(elements.ascendingNodeRad, elements.ascendingNodeRateRadPerCty),
    argPeriapsisRad: advance(elements.argPeriapsisRad, elements.argPeriapsisRateRadPerCty),
    meanAnomalyRad: advance(elements.meanAnomalyRad, elements.meanAnomalyRateRadPerCty),
  };
}
