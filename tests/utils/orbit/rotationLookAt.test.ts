import { describe, it, expect } from 'vitest';
import { rotationLookAt } from '../../../src/utils/orbit/rotationLookAt';
import { ECLIPTIC_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Column c of a column-major Mat3 is the contiguous span m[c*3 .. c*3+2].
// A local restatement of the storage contract, so the tests read the matrix the
// way the renderer does rather than through whatever helper built it.
const col = (m: Mat3, c: number): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// det = c0 · (c1 × c2); +1 exactly for a right-handed rotation, −1 for a
// mirrored triad — the failure a swapped cross-product argument order produces.
const det = (m: Mat3): number => {
  const [c0, c1, c2] = [col(m, 0), col(m, 1), col(m, 2)];
  const cross: Vec3 = [
    c1[1] * c2[2] - c1[2] * c2[1],
    c1[2] * c2[0] - c1[0] * c2[2],
    c1[0] * c2[1] - c1[1] * c2[0],
  ];
  return dot(c0, cross);
};

const expectOrthonormal = (m: Mat3): void => {
  const [c0, c1, c2] = [col(m, 0), col(m, 1), col(m, 2)];
  expect(dot(c0, c0)).toBeCloseTo(1, 12);
  expect(dot(c1, c1)).toBeCloseTo(1, 12);
  expect(dot(c2, c2)).toBeCloseTo(1, 12);
  expect(dot(c0, c1)).toBeCloseTo(0, 12);
  expect(dot(c1, c2)).toBeCloseTo(0, 12);
  expect(dot(c0, c2)).toBeCloseTo(0, 12);
  expect(det(m)).toBeCloseTo(1, 12);
};

describe('rotationLookAt', () => {
  it('aims +X at the target', () => {
    const r = rotationLookAt([0, 0, 0], [0, 2, 0]);
    const boresight = col(r, 0);
    expect(boresight[0]).toBeCloseTo(0, 12);
    expect(boresight[1]).toBeCloseTo(1, 12);
    expect(boresight[2]).toBeCloseTo(0, 12);

    // Off-axis, off-origin: nothing about the fixture lets a botched
    // Gram-Schmidt hide behind a zero component.
    const off = rotationLookAt([1, -2, 0.5], [-3, 4, 7]);
    const offBoresight = col(off, 0);
    const expected: Vec3 = [-4, 6, 6.5];
    const len = Math.hypot(...expected);
    expect(offBoresight[0]).toBeCloseTo(expected[0] / len, 12);
    expect(offBoresight[1]).toBeCloseTo(expected[1] / len, 12);
    expect(offBoresight[2]).toBeCloseTo(expected[2] / len, 12);
    expectOrthonormal(off);
  });

  it('survives a boresight along the ecliptic pole', () => {
    // The up reference and the boresight are parallel, so the Gram-Schmidt
    // residual is zero and the fallback reference has to carry the roll —
    // otherwise every column comes back NaN.
    const pole = ECLIPTIC_FRAME.normal;
    const r = rotationLookAt([0, 0, 0], pole);
    for (const v of r) expect(Number.isFinite(v)).toBe(true);
    expectOrthonormal(r);

    const boresight = col(r, 0);
    expect(boresight[0]).toBeCloseTo(pole[0], 12);
    expect(boresight[1]).toBeCloseTo(pole[1], 12);
    expect(boresight[2]).toBeCloseTo(pole[2], 12);
  });
});
