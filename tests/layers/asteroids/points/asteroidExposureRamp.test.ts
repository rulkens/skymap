import { describe, expect, it } from 'vitest';

import { asteroidExposureRamp } from '../../../../src/layers/asteroids/points/utils/asteroidExposureRamp';
import { initialState as T } from '../../../../src/layers/asteroids/state/asteroidTuning/initialState';

describe('asteroidExposureRamp', () => {
  it('rises with zoom, flat under the floor and past the cap', () => {
    let previous = 0;
    for (let z = 1e-6; z <= T.liftCapZoomAu * 100; z *= 1.3) {
      const lift = asteroidExposureRamp(z, 'mainBelt', T);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
    const atFloor = asteroidExposureRamp(T.liftFloorZoomAu, 'mainBelt', T);
    const atCap = asteroidExposureRamp(T.liftCapZoomAu, 'mainBelt', T);
    expect(asteroidExposureRamp(0, 'mainBelt', T)).toBe(atFloor);
    expect(asteroidExposureRamp(T.liftCapZoomAu * 1e3, 'mainBelt', T)).toBe(atCap);
    expect(atCap).toBeGreaterThan(atFloor);
  });

  // The bug: under the inner cap the Kuiper belt seen from 400 AU fell ~6 mag short and drew nothing.
  it('keeps lifting the distant class past the inner cap, up to its own', () => {
    expect(asteroidExposureRamp(400, 'distant', T)).toBe(T.liftPerAu2 * 400 ** 2);
    expect(asteroidExposureRamp(T.distantLiftCapZoomAu * 10, 'distant', T)).toBe(
      T.liftPerAu2 * T.distantLiftCapZoomAu ** 2,
    );
    expect(asteroidExposureRamp(5, 'distant', T)).toBe(asteroidExposureRamp(5, 'mainBelt', T));
  });
});
