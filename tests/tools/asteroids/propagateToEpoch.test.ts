import { describe, expect, it } from 'vitest';

import { parseMpcorbLine } from '../../../tools/asteroids/parseMpcorbLine';
import { propagateToEpoch } from '../../../tools/asteroids/propagateToEpoch';

const CERES = parseMpcorbLine(
  '00001    3.34  0.15 K2669 274.41935   73.29420   80.24863   10.58803  0.0796923  0.21430445   2.7655526  0 E2026-SD4  7376 127 1801-2026 0.82 M-v 30k MPCORBFIT  4000      (1) Ceres              20260922',
);
const CERES_MPC_N_DEG_PER_DAY = 0.21430445;

describe('propagateToEpoch', () => {
  it('advances M at MPC’s own mean motion and wraps into [0, 360)', () => {
    const days = 1000;
    const moved = propagateToEpoch(CERES, CERES.epochJd + days);
    const expected = (CERES.meanAnomalyDeg + CERES_MPC_N_DEG_PER_DAY * days) % 360;
    expect(moved.epochJd).toBe(CERES.epochJd + days);
    expect(Math.abs(moved.meanAnomalyDeg - expected)).toBeLessThan(1e-4);
    const back = propagateToEpoch(CERES, CERES.epochJd - days);
    expect(back.meanAnomalyDeg).toBeGreaterThanOrEqual(0);
    expect(back.meanAnomalyDeg).toBeLessThan(360);
  });
});
