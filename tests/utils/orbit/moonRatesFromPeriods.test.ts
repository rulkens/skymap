import { describe, it, expect } from 'vitest';
import { moonRatesFromPeriods } from '../../../src/utils/orbit/moonRatesFromPeriods';

describe('moonRatesFromPeriods', () => {
  it('advances the apsis (+) and regresses the node (−) for a prograde moon', () => {
    // The sign convention is load-bearing and can only be caught here or by the
    // Io Horizons position test (which weakly constrains the apsidal sign at its
    // chosen date). A prograde satellite's periapsis advances and its node
    // regresses; a flipped sign would send a moon around backwards over decades.
    const rates = moonRatesFromPeriods({
      periodDays: 1,
      apsidalPrecessionYears: 10,
      nodalPrecessionYears: 20,
    });
    expect(rates.argPeriapsisRateRadPerCty).toBeGreaterThan(0);
    expect(rates.ascendingNodeRateRadPerCty).toBeLessThan(0);
  });

  it('freezes a 0-period precession to zero rate, never Infinity', () => {
    // JPL writes Papsis/Pnode = 0.000 when an element is geometrically undefined
    // (Io/Enceladus/Dione: Pnode=0; Deimos: Papsis=0). Without the guard the
    // division would be 2π·100/0 = Infinity, poisoning every derived position
    // with NaN. The mean-anomaly period is always real, so its rate stays finite.
    const rates = moonRatesFromPeriods({
      periodDays: 1.762732,
      apsidalPrecessionYears: 0,
      nodalPrecessionYears: 0,
    });
    expect(rates.argPeriapsisRateRadPerCty).toBe(0);
    expect(rates.ascendingNodeRateRadPerCty).toBe(0);
    expect(Number.isFinite(rates.meanAnomalyRateRadPerCty)).toBe(true);
  });

  it("treats Tethys's degenerate 0.005-yr apsidal period as no precession", () => {
    // Tethys (near-circular, e≈0.001) lists Papsis=0.005 yr — literally 72000°/yr,
    // a table artifact of a numerically meaningless periapsis direction. It must
    // freeze to a 0 ω-rate, NOT produce that absurd spin, while its real 4.982-yr
    // nodal regression survives.
    const rates = moonRatesFromPeriods({
      periodDays: 1.887802,
      apsidalPrecessionYears: 0.005,
      nodalPrecessionYears: 4.982,
    });
    expect(rates.argPeriapsisRateRadPerCty).toBe(0);
    expect(rates.ascendingNodeRateRadPerCty).toBeLessThan(0);
  });
});
