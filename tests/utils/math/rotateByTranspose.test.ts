import { describe, it, expect } from 'vitest';

import { rotateByTranspose } from '../../../src/utils/math/rotateByTranspose';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('rotateByTranspose', () => {
  it('applies the inverse rotation', () => {
    // orientation: a +90° rotation about Z, column-major (col0=+X→+Y). Its
    // transpose is the -90° rotation about Z, which by the standard rotation
    // formula sends (x,y,z) -> (y,-x,z) — hand-derived, not via the function
    // or multiply3x3.
    const orientation: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const v: Vec3 = [1, 2, 3];

    expect(rotateByTranspose(orientation, v)).toEqual([2, -1, 3]);
  });
});
