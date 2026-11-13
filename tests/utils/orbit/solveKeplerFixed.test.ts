import { describe, expect, it } from 'vitest';

import { solveKeplerFixed } from '../../../src/utils/orbit/solveKeplerFixed';
import { eccentricAnomalyFromMean } from '../../../src/utils/orbit/eccentricAnomalyFromMean';

const ECCENTRICITIES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
const MEAN_ANOMALIES = Array.from({ length: 721 }, (_, j) => -Math.PI + (j / 720) * 2 * Math.PI);
// E is on the reduced branch, so M = ±π may come back on the other side of the circle.
const wrap = (x: number): number => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));

describe('solveKeplerFixed', () => {
  it('f32 emulation converges on a grid', () => {
    for (const e of ECCENTRICITIES.map(Math.fround)) {
      // An f32 E is off by up to half an ulp (1.2e-7 near |E| = π), which the residual scales by
      // dM/dE = 1 − e·cos E ≤ 1 + e: the floor of any f32 solver, so the bound carries that factor.
      const bound = 2e-7 * (1 + e);
      for (const m of MEAN_ANOMALIES.map(Math.fround)) {
        const E = solveKeplerFixed(m, e, Math.fround);
        expect(Math.abs(wrap(E - e * Math.sin(E) - m)), `e ${e} M ${m}`).toBeLessThan(bound);
      }
    }
  });

  it('f64 agrees with eccentricAnomalyFromMean', () => {
    for (const e of ECCENTRICITIES) {
      for (const m of MEAN_ANOMALIES) {
        const delta = wrap(solveKeplerFixed(m, e) - eccentricAnomalyFromMean(m, e));
        expect(Math.abs(delta), `e ${e} M ${m}`).toBeLessThan(1e-12);
      }
    }
  });
});
