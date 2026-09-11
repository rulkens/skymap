import { describe, it, expect } from 'vitest';

import { apoapsisMpc } from '../../../src/utils/orbit/apoapsisMpc';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';

function elements(semiMajorMpc: number, eccentricity: number): OrbitalElements {
  return {
    id: 'x',
    focusId: 'sun',
    semiMajorMpc,
    eccentricity,
    inclinationRad: 0,
    ascendingNodeRad: 0,
    argPeriapsisRad: 0,
    meanAnomalyRad: 0,
    color: [1, 1, 1],
  };
}

describe('apoapsisMpc', () => {
  it('is the FAR apside — a·(1+e), not the periapsis a·(1−e)', () => {
    // Halley-like e = 0.967 about a 2 Mpc semi-major axis: 3.934, not 0.066.
    expect(apoapsisMpc(elements(2, 0.967))).toBeCloseTo(3.934, 12);
  });

  it('collapses to the radius on a circular orbit', () => {
    expect(apoapsisMpc(elements(1.5, 0))).toBe(1.5);
  });
});
