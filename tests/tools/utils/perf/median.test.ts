import { describe, expect, it } from 'vitest';

import { median } from '../../../../tools/utils/perf/median';

describe('median', () => {
  it('averages the two middle values of an even-length array', () => {
    // Hand-computed: the two central values of [1,2,3,4] are 2 and 3,
    // their midpoint is 2.5 (NOT produced by calling percentile).
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns the sole value for a single-element array', () => {
    expect(median([5])).toBe(5);
  });
});
