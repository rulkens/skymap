import { describe, it, expect } from 'vitest';
import { keplerianEllipse } from '../../../src/utils/orbit/keplerianEllipse';
import { ECLIPTIC_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// A minimal element set the individual tests override field-by-field. Colour /
// ids / parent are irrelevant to the geometry under test.
const base: OrbitalElements = {
  id: 'test',
  focusId: 'sun',
  semiMajorMpc: 2,
  eccentricity: 0,
  inclinationRad: 0,
  ascendingNodeRad: 0,
  argPeriapsisRad: 0,
  meanAnomalyRad: 0,
  color: [1, 1, 1],
};

describe('keplerianEllipse', () => {
  it('of a circular equatorial orbit spans equal axes in the ecliptic', () => {
    const a = 2;
    const {
      semiMajorMpc: A,
      semiMinorMpc: B,
      centerOffsetMpc: C,
    } = keplerianEllipse({
      ...base,
      semiMajorMpc: a,
      eccentricity: 0,
      inclinationRad: 0,
      ascendingNodeRad: 0,
      argPeriapsisRad: 0,
    });

    // Equal axes of length a, orthogonal.
    expect(len(A)).toBeCloseTo(a, 12);
    expect(len(B)).toBeCloseTo(a, 12);
    expect(dot(A, B)).toBeCloseTo(0, 12);

    // Both axes lie in the ecliptic plane (⟂ its normal).
    expect(dot(A, ECLIPTIC_FRAME.normal)).toBeCloseTo(0, 12);
    expect(dot(B, ECLIPTIC_FRAME.normal)).toBeCloseTo(0, 12);

    // A circle has its centre at the focus.
    expect(len(C)).toBeCloseTo(0, 12);

    // With ω = Ω = 0, periapsis (and so A) points along the shared equinox +x.
    expect(A[0]).toBeCloseTo(a, 12);
    expect(A[1]).toBeCloseTo(0, 12);
    expect(A[2]).toBeCloseTo(0, 12);
  });

  it('centre-offset is a·e along −A for an eccentric orbit', () => {
    const a = 2;
    const e = 0.5;
    const { semiMajorMpc: A, centerOffsetMpc: C } = keplerianEllipse({
      ...base,
      semiMajorMpc: a,
      eccentricity: e,
      inclinationRad: 0.4,
      ascendingNodeRad: 1.1,
      argPeriapsisRad: 0.7,
    });

    // |C_off| = a·e, focus → centre.
    expect(len(C)).toBeCloseTo(a * e, 12);

    // Antiparallel to A: opposite direction, no perpendicular component.
    expect(dot(A, C)).toBeLessThan(0);
    expect(len(cross(A, C))).toBeCloseTo(0, 12);
  });

  it('tilts the plane by the inclination', () => {
    const flat = keplerianEllipse({ ...base, inclinationRad: 0 });
    const tilted = keplerianEllipse({ ...base, inclinationRad: Math.PI / 2 });

    const flatNormal = cross(flat.semiMajorMpc, flat.semiMinorMpc);
    const tiltedNormal = cross(tilted.semiMajorMpc, tilted.semiMinorMpc);

    // A 90° inclination rotates the orbit plane into an orthogonal one — the
    // inclination actually tilts the plane rather than being a no-op.
    expect(dot(flatNormal, tiltedNormal)).toBeCloseTo(0, 12);
  });
});
