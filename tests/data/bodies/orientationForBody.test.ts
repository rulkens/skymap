import { describe, it, expect } from 'vitest';
import { orientationForBody } from '../../../src/data/bodies/orientationForBody';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

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

describe('orientationForBody', () => {
  it("advances Earth's prime meridian one full turn per sidereal day", () => {
    const jd = CONST_J2000 + 1234.5; // an arbitrary offset from the epoch
    const before = orientationForBody('earth', jd);
    const after = orientationForBody('earth', jd + SIDEREAL_DAY);

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
    // Titan carries no rotation row (it is not in the textured set), so it has
    // no meridian to spin — its orientation is the identity at every instant,
    // never a fabricated pole that would drift as the clock advances.
    expect(orientationForBody('titan', CONST_J2000)).toEqual([...IDENTITY_MAT3]);
    expect(orientationForBody('titan', CONST_J2000 + 5000)).toEqual([...IDENTITY_MAT3]);
  });

  it('returns identity for the Sgr A* anchor', () => {
    // Sgr A* is not in BODY_TEXTURE_REGISTRY, so the membership gate above
    // already returns identity for it. This pins that fact so a future
    // accidental texture-registry entry for 'sgr-a-star' can't silently
    // rotate the body-slab basis bodyRelativePose builds from it.
    expect(orientationForBody('sgr-a-star', CONST_J2000)).toEqual([...IDENTITY_MAT3]);
  });
});
