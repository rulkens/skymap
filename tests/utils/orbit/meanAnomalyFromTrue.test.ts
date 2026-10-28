import { describe, expect, it } from 'vitest';
import { meanAnomalyFromTrue } from '../../../src/utils/orbit/meanAnomalyFromTrue';

describe('meanAnomalyFromTrue', () => {
  it('lags the true anomaly on the way out from periapsis', () => {
    // e = 0.5, ν = 90°: E = 2·atan(√(1/3)) = 60°, M = π/3 − 0.5·sin 60°.
    expect(meanAnomalyFromTrue(Math.PI / 2, 0.5)).toBeCloseTo(
      Math.PI / 3 - 0.25 * Math.sqrt(3),
      12,
    );
  });

  it('equals the true anomaly on a circle', () => {
    expect(meanAnomalyFromTrue(1.234, 0)).toBeCloseTo(1.234, 12);
  });
});
