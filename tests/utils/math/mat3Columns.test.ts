import { describe, it, expect } from 'vitest';
import { mat3Columns } from '../../../src/utils/math/mat3Columns';
import type { Mat3 } from '../../../src/@types/math/Mat3';

describe('mat3Columns', () => {
  it('reads the three column-major columns in order', () => {
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { right, up, forward } = mat3Columns(m);
    expect(right).toEqual([1, 2, 3]);
    expect(up).toEqual([4, 5, 6]);
    expect(forward).toEqual([7, 8, 9]);
  });
});
