import { describe, it, expect } from 'vitest';
import { MILKY_WAY_FIELD_SLIDER_FIELDS } from '../../../../../src/layers/milkyWay/tuning/data/milkyWayFieldSliderFields';
import type { MilkyWayFieldSliderKey } from '../../../../../src/layers/milkyWay/tuning/@types/MilkyWayFieldSliderKey';
import { MILKY_WAY_FIELD_TUNING_DEFAULTS } from '../../../../../src/layers/milkyWay/field/data/milkyWayFieldTuningDefaults';

describe('MILKY_WAY_FIELD_SLIDER_FIELDS', () => {
  const defaults: Record<MilkyWayFieldSliderKey, number> = {
    exposure: MILKY_WAY_FIELD_TUNING_DEFAULTS.exposure,
    ...MILKY_WAY_FIELD_TUNING_DEFAULTS.divisors,
  };

  // A default outside its range boots the slider pinned to an end stop.
  it('every slider spans its default with a positive step', () => {
    for (const f of MILKY_WAY_FIELD_SLIDER_FIELDS) {
      expect(f.step).toBeGreaterThan(0);
      expect(f.min).toBeLessThanOrEqual(defaults[f.key]);
      expect(f.max).toBeGreaterThanOrEqual(defaults[f.key]);
    }
  });
});
