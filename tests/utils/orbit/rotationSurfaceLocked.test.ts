import { describe, it, expect } from 'vitest';
import { rotationSurfaceLocked } from '../../../src/utils/orbit/rotationSurfaceLocked';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Column c of a column-major Mat3 is the contiguous span m[c*3 .. c*3+2].
const col = (m: Mat3, c: number): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// det = c0 · (c1 × c2); +1 for a right-handed triad, −1 for a mirrored one.
const det = (m: Mat3): number => {
  const [c0, c1, c2] = [col(m, 0), col(m, 1), col(m, 2)];
  return dot(c0, [
    c1[1] * c2[2] - c1[2] * c2[1],
    c1[2] * c2[0] - c1[0] * c2[2],
    c1[0] * c2[1] - c1[1] * c2[0],
  ]);
};

const expectVec = (actual: Vec3, expected: Vec3): void => {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
};

// Host at the origin spinning about world +z, site on the equator at world +x.
// Local up is then +x, local north is +z and local east is +y — a triad written
// out by hand, so the expectations below are independent of the derivation.
const HOST_POS: Vec3 = [0, 0, 0];
const HOST_POLE: Vec3 = [0, 0, 1];
const SITE_POS: Vec3 = [3, 0, 0];

describe('rotationSurfaceLocked', () => {
  it('builds the local ENU triad', () => {
    const north = rotationSurfaceLocked(SITE_POS, HOST_POS, HOST_POLE, 0);
    expectVec(col(north, 2), [1, 0, 0]);
    expectVec(col(north, 0), [0, 0, 1]);
    expect(det(north)).toBeCloseTo(1, 12);

    // A 90° heading swings forward from north onto east.
    const east = rotationSurfaceLocked(SITE_POS, HOST_POS, HOST_POLE, 90);
    expectVec(col(east, 2), [1, 0, 0]);
    expectVec(col(east, 0), [0, 1, 0]);
    expect(det(east)).toBeCloseTo(1, 12);
  });
});
