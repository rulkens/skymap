import { describe, expect, it } from 'vitest';

import { lowerBound } from '../../../src/utils/math/lowerBound';

describe('lowerBound', () => {
  it('finds the first index whose predicate is false, n when none is', () => {
    const sorted = [1, 3, 3, 7];
    const at = (v: number) => lowerBound(sorted.length, (i) => sorted[i]! < v);
    expect([at(0), at(3), at(4), at(8)]).toEqual([0, 1, 3, 4]);
    expect(lowerBound(0, () => true)).toBe(0);
  });
});
