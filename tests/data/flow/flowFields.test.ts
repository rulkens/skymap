/**
 * Parity guard for the flow slider registry.
 *
 * `FLOW_SLIDER_FIELDS` is the single home for the flow overlay's numeric knobs;
 * the React/handle/UI layers iterate it instead of re-spelling the field list.
 * The one drift risk is someone adding a numeric leaf to `FlowSettings` (and so
 * to `DEFAULT_FLOW`) without a slider row — it would silently never reach the
 * panels. This test fails in that case: the registry must cover exactly the
 * numeric leaves of `DEFAULT_FLOW`, no more, no less.
 */
import { describe, it, expect } from 'vitest';
import { FLOW_SLIDER_FIELDS } from '../../../src/data/flow/flowFields';
import { DEFAULT_FLOW } from '../../../src/data/defaults';

describe('FLOW_SLIDER_FIELDS — parity with FlowSettings numeric leaves', () => {
  it('covers exactly the number-valued keys of DEFAULT_FLOW', () => {
    const numericKeys = Object.entries(DEFAULT_FLOW)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
      .sort();
    const registryKeys = FLOW_SLIDER_FIELDS.map((f) => f.key).sort();
    expect(registryKeys).toEqual(numericKeys);
  });

  it('declares no duplicate keys', () => {
    const keys = FLOW_SLIDER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every slider has a non-empty, min<=max range', () => {
    for (const f of FLOW_SLIDER_FIELDS) {
      expect(f.min).toBeLessThanOrEqual(f.max);
      expect(f.step).toBeGreaterThan(0);
    }
  });
});
