import { describe, expect, it } from 'vitest';

import { asteroidExposureRamp } from '../../../../src/layers/asteroids/points/utils/asteroidExposureRamp';
import { initialState as T } from '../../../../src/layers/asteroids/state/asteroidTuning/initialState';

describe('asteroidExposureRamp', () => {
  it('rises with zoom², flat under the floor and past the cap', () => {
    let previous = 0;
    for (let z = 1e-6; z <= T.liftCapZoomAu * 100; z *= 1.3) {
      const lift = asteroidExposureRamp(z, T);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
    const atFloor = asteroidExposureRamp(T.liftFloorZoomAu, T);
    const atCap = asteroidExposureRamp(T.liftCapZoomAu, T);
    expect(asteroidExposureRamp(0, T)).toBe(atFloor);
    expect(asteroidExposureRamp(T.liftCapZoomAu * 1e3, T)).toBe(atCap);
    expect(atCap / atFloor).toBeCloseTo((T.liftCapZoomAu / T.liftFloorZoomAu) ** 2, 9);
  });
});
