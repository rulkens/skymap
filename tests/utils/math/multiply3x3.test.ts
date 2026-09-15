import { describe, it, expect } from 'vitest';
import { multiply3x3 } from '../../../src/utils/math/multiply3x3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

describe('multiply3x3', () => {
  it('composes two 90° rotations about Z into a 180° rotation (column-major)', () => {
    // 90° about +Z, column-major: columns are images of the basis axes.
    // x→y, y→-x, z→z.
    const rz90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const rz180 = multiply3x3(rz90, rz90);
    // 180° about Z: x→-x, y→-y, z→z.
    expect(rz180[0]).toBeCloseTo(-1, 12);
    expect(rz180[4]).toBeCloseTo(-1, 12);
    expect(rz180[8]).toBeCloseTo(1, 12);
  });
});
