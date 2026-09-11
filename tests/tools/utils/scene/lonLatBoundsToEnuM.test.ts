import { describe, it, expect } from 'vitest';

import { lonLatBoundsToEnuM } from '../../../../tools/utils/scene/lonLatBoundsToEnuM';

/**
 * Latitude 60 N, where cos = 1/2 exactly, so the two axes' metres-per-degree
 * differ by a clean factor of two and a swapped axis (or a dropped cos) cannot
 * pass. On a 6,371,008.8 m sphere one degree of latitude spans 111,195.08 m
 * and one degree of longitude here spans 55,597.54 m; the expectations below
 * are those two scaled by each edge's degree offset from the anchor.
 */
describe('lonLatBoundsToEnuM', () => {
  it('places each edge at its signed metre offset from the anchor', () => {
    const enu = lonLatBoundsToEnuM({ west: 9.99, east: 10.02, south: 59.99, north: 60.01 }, 60, 10);

    expect(enu.minXM).toBeCloseTo(-555.98, 1);
    expect(enu.maxXM).toBeCloseTo(1111.95, 1);
    expect(enu.minYM).toBeCloseTo(-1111.95, 1);
    expect(enu.maxYM).toBeCloseTo(1111.95, 1);
  });
});
