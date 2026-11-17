import { describe, expect, it } from 'vitest';

import { maxDistanceToPolyline } from '../../../../tools/utils/math/maxDistanceToPolyline';

describe('maxDistanceToPolyline', () => {
  it('measures to the nearest segment, clamped at its ends, and to a lone point', () => {
    const line = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ] as const;
    expect(maxDistanceToPolyline([[5, 2, 0]], line)).toBeCloseTo(2, 12);
    // Past the end: the distance to the endpoint, not to the segment's infinite line.
    expect(maxDistanceToPolyline([[-3, 4, 0]], line)).toBeCloseTo(5, 12);
    expect(
      maxDistanceToPolyline(
        [
          [5, 2, 0],
          [12, 5, 0],
        ],
        line,
      ),
    ).toBeCloseTo(2, 12);
    expect(maxDistanceToPolyline([[0, 3, 4]], [[0, 0, 0]])).toBeCloseTo(5, 12);
  });
});
