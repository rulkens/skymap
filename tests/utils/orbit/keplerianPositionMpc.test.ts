import { describe, it, expect } from 'vitest';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const len = (v: Vec3) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

// A tilted, eccentric element set so the two extreme-anomaly checks exercise
// the full affine map (rotations + centre-offset), not a degenerate flat circle.
// Colour / ids / parent are irrelevant to the geometry under test.
const base: OrbitalElements = {
  id: 'test',
  focusId: 'sun',
  semiMajorMpc: 2,
  eccentricity: 0.5,
  inclinationRad: 0.4,
  ascendingNodeRad: 1.1,
  argPeriapsisRad: 0.7,
  meanAnomalyRad: 0,
  color: [1, 1, 1],
};

describe('keplerianPositionMpc', () => {
  it('at M=0 is periapsis', () => {
    const a = base.semiMajorMpc;
    const e = base.eccentricity;
    const x = keplerianPositionMpc({ ...base, meanAnomalyRad: 0 });

    // Periapsis is the closest point to the focus: |X| = a(1 − e).
    expect(len(x)).toBeCloseTo(a * (1 - e), 12);
  });

  it('at M=π is apoapsis', () => {
    const a = base.semiMajorMpc;
    const e = base.eccentricity;
    const x = keplerianPositionMpc({ ...base, meanAnomalyRad: Math.PI });

    // Apoapsis is the farthest point from the focus: |X| = a(1 + e).
    expect(len(x)).toBeCloseTo(a * (1 + e), 12);
  });
});
