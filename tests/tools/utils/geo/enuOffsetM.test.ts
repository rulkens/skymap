import { describe, it, expect } from 'vitest';

import { enuOffsetM } from '../../../../tools/utils/geo/enuOffsetM';

const R = 6_371_008.8;

describe('enuOffsetM', () => {
  it('0.001° of latitude is pure north, no east', () => {
    const [east, north] = enuOffsetM(
      { latDeg: 55.67, lonDeg: 12.53 },
      { latDeg: 55.671, lonDeg: 12.53 },
      R,
    );
    expect(east).toBeCloseTo(0, 6);
    expect(north).toBeCloseTo(111.195, 2);
  });

  it('0.001° of longitude at lat 55.67° is pure east, scaled by cos(lat)', () => {
    const [east, north] = enuOffsetM(
      { latDeg: 55.67, lonDeg: 12.53 },
      { latDeg: 55.67, lonDeg: 12.531 },
      R,
    );
    expect(north).toBeCloseTo(0, 6);
    expect(east).toBeCloseTo(62.709, 2);
  });
});
