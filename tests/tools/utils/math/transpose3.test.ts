import { describe, it, expect } from 'vitest';
import { transpose3 } from '../../../../tools/utils/math/transpose3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

describe('transpose3', () => {
  it('transpose3(transpose3(m)) === m', () => {
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(transpose3(m))).toEqual(m);
  });

  it('swaps rows and columns (column-major)', () => {
    // Column-major: columns are [1,2,3], [4,5,6], [7,8,9].
    // Transpose: columns are [1,4,7], [2,5,8], [3,6,9].
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(m)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });
});
