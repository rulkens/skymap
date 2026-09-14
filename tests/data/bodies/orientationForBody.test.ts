import { describe, it, expect, vi } from 'vitest';
import { orientationForBody } from '../../../src/data/bodies/orientationForBody';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A superset of the real table, plus one row with no BODY_TEXTURE_REGISTRY
// counterpart — the shape a mesh body has, and the only way to exercise the
// rotation-row gate: no real id today has a row without a texture entry.
vi.mock('../../../src/data/bodies/rotationElements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/data/bodies/rotationElements')>();
  const rows = [
    ...actual.ROTATION_ELEMENTS,
    {
      id: 'test-untextured-spinner',
      poleRaDeg: 0,
      poleDecDeg: 90,
      primeMeridianDeg: 0,
      spinRateDegPerDay: 360,
    },
  ];
  return {
    ...actual,
    rotationRowById: (id: string) => rows.find((r) => r.id === id) ?? null,
  };
});

// Apply a column-major Mat3 to a column vector: result[r] = Σ_c m[c*3 + r]·v[c].
// Local restatement of the column-major contract so the test reads the built
// orientation the way the renderer would, independent of how it was composed.
const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

// One sidereal day — Earth's rotation period relative to the fixed stars — in
// days. This is the physical period the IAU Ẇ_earth encodes, so after exactly
// this interval the prime meridian returns to the same sky-fixed direction.
const SIDEREAL_DAY = 0.99726957;

// Every body exercised here orients from its IAU pole row alone, so the position
// map is genuinely unread — an empty one is the honest input, not a stub.
const NO_POSITIONS = new Map<string, Vec3>();

describe('orientationForBody', () => {
  it("advances Earth's prime meridian one full turn per sidereal day", () => {
    const jd = CONST_J2000 + 1234.5; // an arbitrary offset from the epoch
    const before = orientationForBody('earth', jd, NO_POSITIONS);
    const after = orientationForBody('earth', jd + SIDEREAL_DAY, NO_POSITIONS);

    // A body-fixed point on the equator at the prime meridian (local +x). One
    // sidereal day is one full rotation about the pole, so its sky-fixed image
    // returns to (nearly) the same world direction — the physical definition of
    // the day, observed through the rotated vector rather than the raw W literal.
    const meridianBefore = apply(before, [1, 0, 0]);
    const meridianAfter = apply(after, [1, 0, 0]);
    expect(meridianAfter[0]).toBeCloseTo(meridianBefore[0], 4);
    expect(meridianAfter[1]).toBeCloseTo(meridianBefore[1], 4);
    expect(meridianAfter[2]).toBeCloseTo(meridianBefore[2], 4);
  });

  it('leaves a non-textured body orientation-invariant across simDays', () => {
    // Titan carries no rotation row, so it has no meridian to spin — its
    // orientation is the identity at every instant, never a fabricated pole
    // that would drift as the clock advances.
    expect(orientationForBody('titan', CONST_J2000, NO_POSITIONS)).toEqual([...IDENTITY_MAT3]);
    expect(orientationForBody('titan', CONST_J2000 + 5000, NO_POSITIONS)).toEqual([
      ...IDENTITY_MAT3,
    ]);
  });

  it('returns identity for the Sgr A* anchor', () => {
    // Sgr A* has no rotation row, so the gate above already returns identity
    // for it. This pins that fact so a future accidental rotation-table entry
    // for 'sgr-a-star' can't silently rotate the body-slab basis
    // bodyRelativePose builds from it.
    expect(orientationForBody('sgr-a-star', CONST_J2000, NO_POSITIONS)).toEqual([...IDENTITY_MAT3]);
  });

  it('orients a body that has a rotation row but no texture entry', () => {
    // The shape a mesh body has: a rotation row with no BODY_TEXTURE_REGISTRY
    // counterpart. The gate must key off the row, not texture membership, or
    // this body would silently never turn.
    const before = orientationForBody('test-untextured-spinner', CONST_J2000, NO_POSITIONS);
    expect(before).not.toEqual([...IDENTITY_MAT3]);

    // Compare the whole direction rather than one axis: at 360°/day, a single
    // component can coincidentally land near zero both before and after (as
    // it does here — the fixture's pole puts +x's x-component through zero at
    // both instants) without the direction itself having stood still.
    const beforeDir = apply(before, [1, 0, 0]);
    const after = orientationForBody('test-untextured-spinner', CONST_J2000 + 0.5, NO_POSITIONS);
    const afterDir = apply(after, [1, 0, 0]);
    const moved = Math.hypot(
      afterDir[0] - beforeDir[0],
      afterDir[1] - beforeDir[1],
      afterDir[2] - beforeDir[2],
    );
    expect(moved).toBeGreaterThan(0.5);
  });
});
