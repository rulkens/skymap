import { describe, expect, it } from 'vitest';
import { headlightGain } from '../../../src/utils/relativity/headlightGain';

describe('headlightGain', () => {
  it('headlightGain is 1 at k 0', () => {
    for (const d of [1e-8, 0.5, 1, 3, 5.7e7]) expect(headlightGain(d, 0, 64)).toBe(1);
  });

  it('headlightGain is exactly 1 at D 1 for any k', () => {
    for (const k of [0.5, 1, 4]) expect(headlightGain(1, k, 64)).toBe(1);
  });

  // Normalising gain(1) to 1 lifts the asymptote from ceil to ceil + 1.
  it('headlightGain is bounded by the ceiling plus one', () => {
    for (const d of [10, 1e3, 5.7e7]) {
      const gain = headlightGain(d, 4, 64);
      expect(gain).toBeLessThanOrEqual(65);
      expect(Number.isFinite(gain)).toBe(true);
    }
    expect(headlightGain(5.7e7, 4, 64)).toBeCloseTo(65, 6);
  });

  it('headlightGain is pow(D, k) well below it', () => {
    // Within ~1/ceil of pow(D, k): the normalisation trades that much below D = 1.
    expect(headlightGain(0.5, 2, 64) / 0.25).toBeCloseTo(1, 1);
    expect(headlightGain(1.2, 1, 64) / 1.2).toBeCloseTo(1, 1);
  });
});
