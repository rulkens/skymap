import { describe, it, expect } from 'vitest';
import { rotationTidallyLocked } from '../../../src/utils/orbit/rotationTidallyLocked';
import { dot3 } from '../../../src/utils/math/dot3';
import { cross3 } from '../../../src/utils/math/cross3';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const col = (m: Mat3, c: number): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];

describe('rotationTidallyLocked', () => {
  // Pole at the world +z (dec 90°), so the equatorial plane is the xy plane.
  it('points +X at a host in the equatorial plane and +Z along the pole', () => {
    const m = rotationTidallyLocked([1, 1, 0], [1, 4, 0], 0, 90);
    expect(col(m, 0)[0]).toBeCloseTo(0, 12);
    expect(col(m, 0)[1]).toBeCloseTo(1, 12);
    expect(col(m, 2)[2]).toBeCloseTo(1, 12);
  });

  it('removes the pole component of the host direction', () => {
    const m = rotationTidallyLocked([0, 0, 0], [3, 0, 5], 0, 90);
    expect(col(m, 0)[0]).toBeCloseTo(1, 12);
    expect(col(m, 0)[2]).toBeCloseTo(0, 12);
  });

  it('is orthonormal and right-handed for a tilted pole', () => {
    const m = rotationTidallyLocked([0.2, -0.1, 0.3], [1, 2, -0.5], 40.66, 83.52);
    const [x, y, z] = [col(m, 0), col(m, 1), col(m, 2)];
    for (const v of [x, y, z]) expect(dot3(v, v)).toBeCloseTo(1, 12);
    expect(dot3(x, y)).toBeCloseTo(0, 12);
    expect(dot3(x, z)).toBeCloseTo(0, 12);
    const c = cross3(x, y);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(z[i]!, 12);
  });
});
