/**
 * Parity guard for the Milky-Way tuning slider registry.
 *
 * `MILKY_WAY_SLIDER_FIELDS` is the single home for the star cloud's look
 * knobs; the DebugPanel section iterates it instead of re-spelling the field
 * list. The drift risk is someone adding a knob to `MilkyWayTuning` (and so to
 * `MILKY_WAY_TUNING_DEFAULTS`, which the settings seed spreads) without a
 * slider row — it would reach the uniform buffer but never get a control, so
 * the only way to move it would be editing the default and reloading. This
 * test fails in that case.
 */
import { describe, it, expect } from 'vitest';
import { MILKY_WAY_SLIDER_FIELDS } from '../../../src/data/milkyWay/milkyWaySliderFields';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

describe('MILKY_WAY_SLIDER_FIELDS — parity with the tuning knobs', () => {
  it('covers exactly the keys of MILKY_WAY_TUNING_DEFAULTS', () => {
    const registryKeys = MILKY_WAY_SLIDER_FIELDS.map((f) => f.key).sort();
    expect(registryKeys).toEqual(Object.keys(MILKY_WAY_TUNING_DEFAULTS).sort());
  });

  it('declares no duplicate keys', () => {
    const keys = MILKY_WAY_SLIDER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A range that excludes its own default would boot the panel showing a
  // slider already pinned to an end stop, and the first drag would jump the
  // value — the knob would be unusable without anyone seeing an error.
  it('every slider spans its default with a positive step', () => {
    for (const f of MILKY_WAY_SLIDER_FIELDS) {
      expect(f.step).toBeGreaterThan(0);
      expect(f.min).toBeLessThanOrEqual(MILKY_WAY_TUNING_DEFAULTS[f.key]);
      expect(f.max).toBeGreaterThanOrEqual(MILKY_WAY_TUNING_DEFAULTS[f.key]);
    }
  });
});
