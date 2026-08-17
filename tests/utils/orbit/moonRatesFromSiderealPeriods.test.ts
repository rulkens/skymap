import { describe, it, expect } from 'vitest';
import { moonRatesFromSiderealPeriods } from '../../../src/utils/orbit/moonRatesFromSiderealPeriods';

describe('moonRatesFromSiderealPeriods', () => {
  it("recovers the Moon's 27.55-day anomalistic month from its sidereal inputs", () => {
    // Independent physical anchor, not a restatement of the subtraction: feed
    // the Moon's three JPL columns (sidereal month 27.322 d, apsis 5.997 yr,
    // node 18.6 yr) and the implied mean-anomaly period must land on the
    // famous 27.5545-day anomalistic month — a constant this module never
    // mentions. Reading the sidereal month as the M-period instead (the bug
    // this converter exists to prevent) yields 27.322 exactly, and a flipped
    // precession sign yields ~26.9 (apsis) or ~27.8 (node); all miss the
    // 0.01-day tolerance by more than an order of magnitude.
    const rates = moonRatesFromSiderealPeriods({
      siderealPeriodDays: 27.322,
      apsidalPrecessionYears: 5.997,
      nodalPrecessionYears: 18.6,
    });
    const turnsPerCentury = rates.meanAnomalyRateRadPerCty / (2 * Math.PI);
    const anomalisticDays = 36_525 / turnsPerCentury;
    expect(anomalisticDays).toBeCloseTo(27.5545, 2);
  });

  it('reduces to the plain converter when nothing precesses', () => {
    // With both precessions degenerate (the 0-period sentinel), sidereal and
    // anomalistic periods coincide, so the two converters must agree — pins
    // the delegation: the sidereal variant only re-derives dM/dt, never the
    // precession handling.
    const rates = moonRatesFromSiderealPeriods({
      siderealPeriodDays: 10,
      apsidalPrecessionYears: 0,
      nodalPrecessionYears: 0,
    });
    expect(rates.meanAnomalyRateRadPerCty).toBeCloseTo((2 * Math.PI * 36_525) / 10, 10);
    expect(rates.argPeriapsisRateRadPerCty).toBe(0);
    expect(rates.ascendingNodeRateRadPerCty).toBe(0);
  });
});
