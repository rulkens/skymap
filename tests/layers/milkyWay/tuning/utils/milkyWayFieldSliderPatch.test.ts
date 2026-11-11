import { describe, it, expect } from 'vitest';
import { milkyWayFieldSliderPatch } from '../../../../../src/layers/milkyWay/tuning/utils/milkyWayFieldSliderPatch';
import { MILKY_WAY_FIELD_TUNING_DEFAULTS } from '../../../../../src/layers/milkyWay/field/data/milkyWayFieldTuningDefaults';

describe('milkyWayFieldSliderPatch', () => {
  it('a divisor patch keeps the other divisors of the live record', () => {
    const live = {
      ...MILKY_WAY_FIELD_TUNING_DEFAULTS,
      divisors: { ...MILKY_WAY_FIELD_TUNING_DEFAULTS.divisors, young: 3 },
    };
    const patch = milkyWayFieldSliderPatch(live, 'dig', 5);
    expect(patch.divisors).toEqual({ ...live.divisors, dig: 5 });
  });
});
