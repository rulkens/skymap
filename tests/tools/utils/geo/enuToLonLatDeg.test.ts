import { describe, it, expect } from 'vitest';

import { enuOffsetM } from '../../../../tools/utils/geo/enuOffsetM';
import { enuToLonLatDeg } from '../../../../tools/utils/geo/enuToLonLatDeg';

const R = 6_371_008.8;

describe('enuToLonLatDeg', () => {
  it('round-trips enuOffsetM at 55.67°N', () => {
    const site = { latDeg: 55.67, lonDeg: 12.53 };
    const to = { latDeg: 55.6712, lonDeg: 12.5347 };
    const [east, north] = enuOffsetM(site, to, R);

    const back = enuToLonLatDeg(site, east, north, R);

    expect(back.latDeg).toBeCloseTo(to.latDeg, 9);
    expect(back.lonDeg).toBeCloseTo(to.lonDeg, 9);
  });
});
