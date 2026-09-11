import { describe, it, expect } from 'vitest';

import { probe } from '../../../../src/data/bodies/makers/probe';
import { degToRad } from '../../../../src/utils/math/degToRad';
import { propagateElements } from '../../../../src/utils/orbit/propagateElements';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Voyager 1's Horizons ELEMENTS columns, heliocentric ecliptic J2000, fetched
// at epoch JDTDB 2461294.5 (2026-09-11). The `MA` column is deliberately not
// among them: the maker derives M from `Tp`, so MA stays a free cross-check.
const voyager1 = () => ({
  id: 'voyager1',
  focusId: 'sun',
  semiMajorAu: -3.215481966557751,
  eccentricity: 3.703612020159509,
  inclinationDeg: 35.76697119202111,
  ascendingNodeDeg: 178.8798914884395,
  argPeriapsisDeg: 338.25000336994,
  periapsisJd: 2444233.650346363429,
  meanMotionDegPerDay: 0.1709365587071547,
  color: [1, 1, 1] as Vec3,
});

const FETCH_EPOCH_JD = 2461294.5;
/** Horizons' own `MA` at that epoch — an external fact, not a restatement. */
const PUBLISHED_MEAN_ANOMALY_DEG = 2916.322928412766;

describe('probe()', () => {
  it("reproduces JPL's published mean anomaly at the fetch epoch", () => {
    const row = probe(voyager1());

    expect(propagateElements(row, FETCH_EPOCH_JD).meanAnomalyRad).toBeCloseTo(
      degToRad(PUBLISHED_MEAN_ANOMALY_DEG),
      9,
    );
  });

  it('keeps the epoch mean anomaly unwrapped and the hyperbolic axis negative', () => {
    const row = probe(voyager1());

    // M at J2000 is ~1249.8°, three revolutions of mean anomaly past periapsis;
    // wrapping it into [0, 2π) would silently teleport the probe along its
    // trajectory, and negating `a` would break the hyperbola it encodes.
    expect(row.meanAnomalyRad).toBeGreaterThan(6 * Math.PI);
    expect(row.semiMajorMpc).toBeLessThan(0);
  });
});
