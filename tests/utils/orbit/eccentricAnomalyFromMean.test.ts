import { describe, it, expect } from 'vitest';

import { eccentricAnomalyFromMean } from '../../../src/utils/orbit/eccentricAnomalyFromMean';

describe('eccentricAnomalyFromMean', () => {
  it('returns M when e is 0', () => {
    // A circular orbit has E = M exactly — Kepler's equation collapses to
    // M = E − 0·sin(E). This is independent of the Newton iteration, so it
    // pins the trivial baseline.
    expect(eccentricAnomalyFromMean(0.3, 0)).toBeCloseTo(0.3, 12);
    expect(eccentricAnomalyFromMean(2.1, 0)).toBeCloseTo(2.1, 12);
  });

  it("satisfies Kepler's equation", () => {
    // Residual property: whatever E the solver returns must satisfy
    // E − e·sin(E) − M ≈ 0. Checking the residual (rather than a hard-coded
    // E) is independent of the iteration's internals.
    const cases: Array<{ m: number; e: number }> = [
      { m: 0.1, e: 0.05 },
      { m: 1.5, e: 0.05 },
      { m: 3.0, e: 0.5 },
      { m: 5.5, e: 0.5 },
    ];
    for (const { m, e } of cases) {
      const eAnom = eccentricAnomalyFromMean(m, e);
      const residual = eAnom - e * Math.sin(eAnom) - m;
      expect(Math.abs(residual)).toBeLessThan(1e-10);
    }
  });

  it('round-trips a known E', () => {
    // Pick E and e, form M forward by hand, then confirm the inverse solve
    // recovers the original E.
    const e = 0.4;
    const knownE = 1.2;
    const m = knownE - e * Math.sin(knownE);
    expect(eccentricAnomalyFromMean(m, e)).toBeCloseTo(knownE, 10);
  });
});
