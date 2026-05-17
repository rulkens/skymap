import { describe, it, expect } from 'vitest';
import { applyMat3, transpose3 } from '../../../../tools/utils/math/mat3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

/**
 * Column-major Mat3 ops.  Identity sanity, transpose-of-transpose
 * round-trip, and a hand-computed rotation example.
 */
describe('mat3', () => {
  const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it('applyMat3 with identity returns the input vector', () => {
    expect(applyMat3(identity, [3, 4, 5])).toEqual([3, 4, 5]);
  });

  it('transpose3(transpose3(m)) === m', () => {
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(transpose3(m))).toEqual(m);
  });

  it('transpose3 swaps rows and columns (column-major)', () => {
    // Column-major: columns are [1,2,3], [4,5,6], [7,8,9].
    // Transpose: columns are [1,4,7], [2,5,8], [3,6,9].
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(m)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  it('applyMat3 performs a 90° rotation about Z', () => {
    // Column-major 90° rotation about +Z: x → y, y → -x, z → z.
    // Columns: [0,1,0], [-1,0,0], [0,0,1].
    const rotZ90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    expect(applyMat3(rotZ90, [1, 0, 0])).toEqual([0, 1, 0]);
    expect(applyMat3(rotZ90, [0, 1, 0])).toEqual([-1, 0, 0]);
  });
});
