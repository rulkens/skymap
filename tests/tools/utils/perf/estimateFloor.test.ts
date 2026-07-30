import { describe, expect, it } from 'vitest';

import { estimateFloor } from '../../../../tools/utils/perf/estimateFloor';

describe('estimateFloor', () => {
  it('averages the per-pass load/store excess over the group', () => {
    // (3.6 + 3.1 + 3.4 - 4.2) / 3 = 5.9 / 3 = 1.9667
    expect(estimateFloor([3.6, 3.1, 3.4], 4.2)).toBeCloseTo(1.9667, 3);
  });

  it('clamps a negative estimate to 0', () => {
    // (1 + 1 - 5) / 2 = -1.5 → clamped to 0
    expect(estimateFloor([1, 1], 5)).toBe(0);
  });

  it('returns 0 for a single-layer group (no floor to separate)', () => {
    expect(estimateFloor([3.4], 3.0)).toBe(0);
  });
});
