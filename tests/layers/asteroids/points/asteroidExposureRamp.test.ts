import { describe, expect, it } from 'vitest';

import { asteroidExposureRamp } from '../../../../src/layers/asteroids/points/utils/asteroidExposureRamp';
import { ASTEROID_PHOTOMETRY as P } from '../../../../src/layers/asteroids/points/data/asteroidPhotometry';

describe('asteroidExposureRamp', () => {
  it('rises with zoom², flat under the floor and past the cap', () => {
    let previous = 0;
    for (let z = 1e-6; z <= P.liftCapZoomAu * 100; z *= 1.3) {
      const lift = asteroidExposureRamp(z);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
    const atFloor = asteroidExposureRamp(P.liftFloorZoomAu);
    const atCap = asteroidExposureRamp(P.liftCapZoomAu);
    expect(asteroidExposureRamp(0)).toBe(atFloor);
    expect(asteroidExposureRamp(P.liftCapZoomAu * 1e3)).toBe(atCap);
    expect(atCap / atFloor).toBeCloseTo((P.liftCapZoomAu / P.liftFloorZoomAu) ** 2, 9);
  });
});
