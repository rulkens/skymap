import { describe, expect, it } from 'vitest';

import { asteroidExposureRamp } from '../../../../src/layers/asteroids/points/utils/asteroidExposureRamp';
import { ASTEROID_PHOTOMETRY as P } from '../../../../src/layers/asteroids/points/data/asteroidPhotometry';

describe('asteroidExposureRamp', () => {
  it('exposure ramp is exactly 1 inside the near anchor, monotone, and flat past the far anchor', () => {
    for (const d of [0, 0.5, 1, P.rampNearAu]) expect(asteroidExposureRamp(d)).toBe(1);
    let previous = 1;
    for (let d = P.rampNearAu; d <= P.rampFarAu * 2; d *= 1.1) {
      const lift = asteroidExposureRamp(d);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
    expect(asteroidExposureRamp(P.rampFarAu * 0.999) / P.rampFarLift).toBeCloseTo(1, 2);
    expect(asteroidExposureRamp(P.rampFarAu)).toBe(P.rampFarLift);
    expect(asteroidExposureRamp(P.rampFarAu * 10)).toBe(P.rampFarLift);
  });
});
