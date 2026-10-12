import { describe, it, expect } from 'vitest';

import { meanAnomalyCorrectionTarget } from '../../../../tools/utils/math/meanAnomalyCorrectionTarget';
import { keplerianPositionMpc } from '../../../../src/utils/orbit/keplerianPositionMpc';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { OrbitalElements } from '../../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const row: OrbitalElements = {
  id: 'test',
  focusId: 'saturn',
  semiMajorMpc: 1_000_000 * SCALE_UNITS.KM_TO_MPC,
  eccentricity: 0.2,
  inclinationRad: 0.4,
  ascendingNodeRad: 1.1,
  argPeriapsisRad: 2.3,
  meanAnomalyRad: 0.5,
  color: [1, 1, 1],
};

const shiftedKm = (dM: number): Vec3 =>
  keplerianPositionMpc({ ...row, meanAnomalyRad: row.meanAnomalyRad + dM }).map(
    (v) => v / SCALE_UNITS.KM_TO_MPC,
  ) as Vec3;

describe('meanAnomalyCorrectionTarget', () => {
  it('meanAnomalyCorrectionTarget recovers a known shift', () => {
    // −3.0 rad is nearly half an orbit: the in-plane seed (a true-anomaly difference on an
    // e = 0.2 conic) is off by a few tenths, and the iteration must still land on −3.0.
    for (const dM of [0.7, -3.0]) {
      expect(meanAnomalyCorrectionTarget(row, shiftedKm(dM))).toBeCloseTo(dM, 9);
    }
  });
});
