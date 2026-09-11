import { describe, it, expect } from 'vitest';

import { hyperbolicPositionMpc } from '../../../src/utils/orbit/hyperbolicPositionMpc';
import { perifocalAxesWorld } from '../../../src/utils/orbit/perifocalAxesWorld';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';

const SEMI_MAJOR_AU = -3.2153;
const ECCENTRICITY = 3.7;

const row: OrbitalElements = {
  id: 'hyperbola',
  focusId: 'sun',
  semiMajorMpc: SEMI_MAJOR_AU * SCALE_UNITS.AU_TO_MPC,
  eccentricity: ECCENTRICITY,
  inclinationRad: 0.61,
  ascendingNodeRad: 2.3,
  argPeriapsisRad: -1.1,
  meanAnomalyRad: 0,
  color: [1, 1, 1],
};

describe('hyperbolicPositionMpc', () => {
  it('puts periapsis at q = a·(1 − e) from the focus', () => {
    // Hand-derived from the conic: at M = 0 the body sits at periapsis, whose
    // focal distance is a·(1 − e) — positive because a is negative for a
    // hyperbola. Magnitude is rotation-invariant, so the tilted row pins it
    // whatever the perifocal axes do.
    const [x, y, z] = hyperbolicPositionMpc(row);
    const distanceMpc = Math.sqrt(x * x + y * y + z * z);
    const expectedMpc = SEMI_MAJOR_AU * (1 - ECCENTRICITY) * SCALE_UNITS.AU_TO_MPC;

    expect(distanceMpc / expectedMpc).toBeCloseTo(1, 12);
  });

  it('runs prograde past periapsis, at r = a·(1 − e·cosh H)', () => {
    // H = 1.3 outbound, with M formed forward by hand and r taken from the
    // conic relation — the only check that pins B's flipped sign, which the
    // periapsis case cannot see (sinh 0 = 0).
    const h = 1.3;
    const position = hyperbolicPositionMpc({
      ...row,
      meanAnomalyRad: ECCENTRICITY * Math.sinh(h) - h,
    });

    const { qWorld } = perifocalAxesWorld(row);
    const prograde = position[0] * qWorld[0] + position[1] * qWorld[1] + position[2] * qWorld[2];
    expect(prograde).toBeGreaterThan(0);

    const distanceMpc = Math.hypot(position[0], position[1], position[2]);
    const expectedMpc = SEMI_MAJOR_AU * (1 - ECCENTRICITY * Math.cosh(h)) * SCALE_UNITS.AU_TO_MPC;
    expect(distanceMpc / expectedMpc).toBeCloseTo(1, 12);
  });
});
