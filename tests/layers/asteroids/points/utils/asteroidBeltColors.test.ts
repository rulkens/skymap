import { describe, expect, it } from 'vitest';
import { asteroidBeltColors } from '../../../../../src/layers/asteroids/points/utils/asteroidBeltColors';
import { initialState } from '../../../../../src/layers/asteroids/state/asteroidTuning/initialState';
import { rec709Luminance } from '../../../../../src/utils/color/rec709Luminance';

describe('asteroidBeltColors', () => {
  it('by class, every band is the main belt class tint, so the bands do not show', () => {
    const tint = initialState.colors.mainBelt;
    expect(asteroidBeltColors({ ...initialState, colorBy: 'class' })).toEqual([tint, tint, tint]);
  });

  it('by semi-major axis, the ends are the ramp and the middle sits at their mean luminance', () => {
    const { inner, outer } = initialState.beltRamp;
    const [a, middle, c] = asteroidBeltColors({ ...initialState, colorBy: 'semiMajorAxis' });
    expect([a, c]).toEqual([inner, outer]);
    expect(rec709Luminance(middle)).toBeCloseTo(
      (rec709Luminance(inner) + rec709Luminance(outer)) / 2,
      9,
    );
    expect(middle[0]).toBeLessThan(inner[0]);
    expect(middle[0]).toBeGreaterThan(outer[0]);
  });
});
