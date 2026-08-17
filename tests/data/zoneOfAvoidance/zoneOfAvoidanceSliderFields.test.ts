/**
 * Parity guard for the Zone-of-Avoidance tuning slider registry.
 *
 * `ZONE_OF_AVOIDANCE_SLIDER_FIELDS` is the single home for the guide band's
 * scalar look knobs; the DebugPanel section iterates it instead of
 * re-spelling the field list. The drift risk is someone adding a scalar knob
 * to `ZoneOfAvoidanceTuning` without a slider row — it would reach the
 * uniform buffer but never get a control, so the only way to move it would be
 * editing the default and reloading. This test fails in that case.
 */
import { describe, it, expect } from 'vitest';
import { ZONE_OF_AVOIDANCE_SLIDER_FIELDS } from '../../../src/data/zoneOfAvoidance/zoneOfAvoidanceSliderFields';
import { DEFAULT_ZONE_OF_AVOIDANCE_TUNING } from '../../../src/data/defaults';
import type { ZoneOfAvoidanceTuning } from '../../../src/@types/settings/ZoneOfAvoidanceTuning';

describe('ZONE_OF_AVOIDANCE_SLIDER_FIELDS — parity with the tuning knobs', () => {
  it('covers exactly the scalar keys of ZoneOfAvoidanceTuning', () => {
    const registryKeys = ZONE_OF_AVOIDANCE_SLIDER_FIELDS.map((f) => f.key).sort();
    const scalarKeys = (
      Object.keys(DEFAULT_ZONE_OF_AVOIDANCE_TUNING) as (keyof ZoneOfAvoidanceTuning)[]
    )
      .filter((k) => k !== 'color' && k !== 'labelColor')
      .sort();
    expect(registryKeys).toEqual(scalarKeys);
  });

  it('declares no duplicate keys', () => {
    const keys = ZONE_OF_AVOIDANCE_SLIDER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A range that ends on its own default boots the panel showing a slider
  // already pinned to an end stop, draggable in one direction only — so the
  // upper bound is strict, not merely inclusive.
  it('every slider spans its default with a positive step', () => {
    for (const f of ZONE_OF_AVOIDANCE_SLIDER_FIELDS) {
      expect(f.step).toBeGreaterThan(0);
      expect(f.min).toBeLessThanOrEqual(DEFAULT_ZONE_OF_AVOIDANCE_TUNING[f.key]);
      expect(f.max).toBeGreaterThan(DEFAULT_ZONE_OF_AVOIDANCE_TUNING[f.key]);
    }
  });
});
