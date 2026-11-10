/**
 * Parity guard for the Milky-Way tuning slider registry.
 *
 * `MILKY_WAY_CLOUD_SLIDER_FIELDS` is the single home for the star cloud's look
 * knobs; the DebugPanel section iterates it instead of re-spelling the field
 * list. The drift risk is someone adding a knob to `MilkyWayCloudTuning` (and so to
 * `MILKY_WAY_CLOUD_TUNING_DEFAULTS`, which the settings seed copies) without a
 * slider row — it would reach the uniform buffer but never get a control, so
 * the only way to move it would be editing the default and reloading. This
 * test fails in that case.
 */
import { describe, it, expect } from 'vitest';
import { MILKY_WAY_CLOUD_SLIDER_FIELDS } from '../../../../../src/layers/milkyWay/tuning/data/milkyWayCloudSliderFields';
import {
  MILKY_WAY_FIELD_SLIDER_FIELDS,
  milkyWayFieldSliderPatch,
} from '../../../../../src/layers/milkyWay/tuning/data/milkyWayFieldSliderFields';
import type { MilkyWayFieldSliderKey } from '../../../../../src/layers/milkyWay/tuning/@types/MilkyWayFieldSliderKey';
import { FIELD_TARGET_IDS } from '../../../../../src/layers/milkyWay/field/data/fieldTargetIds';
import { MILKY_WAY_FIELD_TUNING_DEFAULTS } from '../../../../../src/layers/milkyWay/field/data/milkyWayFieldTuningDefaults';
import { MILKY_WAY_CLOUD_TUNING_DEFAULTS } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

describe('MILKY_WAY_CLOUD_SLIDER_FIELDS — parity with the tuning knobs', () => {
  it('covers exactly the keys of MILKY_WAY_CLOUD_TUNING_DEFAULTS', () => {
    const registryKeys = MILKY_WAY_CLOUD_SLIDER_FIELDS.map((f) => f.key).sort();
    expect(registryKeys).toEqual(Object.keys(MILKY_WAY_CLOUD_TUNING_DEFAULTS).sort());
  });

  // A range that excludes its own default would boot the panel showing a
  // slider already pinned to an end stop, and the first drag would jump the
  // value — the knob would be unusable without anyone seeing an error.
  it('every slider spans its default with a positive step', () => {
    for (const f of MILKY_WAY_CLOUD_SLIDER_FIELDS) {
      expect(f.step).toBeGreaterThan(0);
      expect(f.min).toBeLessThanOrEqual(MILKY_WAY_CLOUD_TUNING_DEFAULTS[f.key]);
      expect(f.max).toBeGreaterThanOrEqual(MILKY_WAY_CLOUD_TUNING_DEFAULTS[f.key]);
    }
  });
});

describe('MILKY_WAY_FIELD_SLIDER_FIELDS — parity with the field knobs', () => {
  const defaults: Record<MilkyWayFieldSliderKey, number> = {
    exposure: MILKY_WAY_FIELD_TUNING_DEFAULTS.exposure,
    ...MILKY_WAY_FIELD_TUNING_DEFAULTS.divisors,
  };

  it('covers exposure and every field target', () => {
    const keys = MILKY_WAY_FIELD_SLIDER_FIELDS.map((f) => f.key).sort();
    expect(keys).toEqual(['exposure', ...FIELD_TARGET_IDS].sort());
  });

  it('every slider spans its default with a positive step', () => {
    for (const f of MILKY_WAY_FIELD_SLIDER_FIELDS) {
      expect(f.step).toBeGreaterThan(0);
      expect(f.min).toBeLessThanOrEqual(defaults[f.key]);
      expect(f.max).toBeGreaterThanOrEqual(defaults[f.key]);
    }
  });

  it('a divisor patch keeps the other divisors of the live record', () => {
    const live = {
      ...MILKY_WAY_FIELD_TUNING_DEFAULTS,
      divisors: { ...MILKY_WAY_FIELD_TUNING_DEFAULTS.divisors, young: 3 },
    };
    const patch = milkyWayFieldSliderPatch(live, 'dig', 5);
    expect(patch.divisors).toEqual({ ...live.divisors, dig: 5 });
  });
});
