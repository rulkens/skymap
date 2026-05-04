/**
 * Unit tests for `lookbackTimeGyr` — the t_L = (z / (1+z)) × t_H approximation.
 *
 * Verifies the boundary at z=0, monotonic increase with z, and the asymptote
 * toward the Hubble time t_H ≈ 13.97 Gyr as z → ∞.  This approximation is
 * exact only for an empty universe but is good to a few percent for SDSS z.
 */

import { describe, it, expect } from 'vitest';
import { lookbackTimeGyr } from '../../../src/utils/math/lookbackTimeGyr';
import { HUBBLE_TIME_GYR } from '../../../src/utils/math/constants';

describe('lookbackTimeGyr', () => {
  it('returns 0 at z = 0 (no lookback for the present epoch)', () => {
    expect(lookbackTimeGyr(0)).toBe(0);
  });

  it('returns half the Hubble time at z = 1 (z/(1+z) = 0.5)', () => {
    // At z = 1, the formula gives t_H × 0.5.  This is the only redshift where
    // the closed-form ratio is a clean number, so it doubles as a sanity-check
    // on the constant table.
    expect(lookbackTimeGyr(1)).toBeCloseTo(HUBBLE_TIME_GYR * 0.5, 6);
  });

  it('is monotonically increasing in z', () => {
    // Light from a more distant (higher-z) source has been travelling longer,
    // so lookback must grow with z everywhere.
    let prev = -1;
    for (let z = 0; z <= 5; z += 0.1) {
      const t = lookbackTimeGyr(z);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('asymptotes to the Hubble time as z grows large', () => {
    // The factor z/(1+z) → 1 as z → ∞, so lookback approaches t_H.
    // At z = 1000 we should already be well within 0.1 % of the asymptote.
    expect(lookbackTimeGyr(1000)).toBeCloseTo(HUBBLE_TIME_GYR, 1);
    // It must never *exceed* t_H — that would be an unphysical "older than the
    // (empty-universe) age of the universe" result.
    expect(lookbackTimeGyr(1e6)).toBeLessThan(HUBBLE_TIME_GYR);
  });
});
