import { describe, it, expect } from 'vitest';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';

describe('mat3FromColumns', () => {
  it('lays each column out as a contiguous 3-element span (column-major)', () => {
    const m = mat3FromColumns([1, 2, 3], [4, 5, 6], [7, 8, 9]);
    expect(m).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
