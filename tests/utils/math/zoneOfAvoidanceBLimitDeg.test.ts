/**
 * zoneOfAvoidanceBLimitDeg — pins the three anchor longitudes of the cosine
 * bump: bulge-facing (widest), anticenter-facing (narrowest), and the
 * quarter-turn midpoint, per Grill Q8.
 */

import { describe, it, expect } from 'vitest';

import { zoneOfAvoidanceBLimitDeg } from '../../../src/utils/math/zoneOfAvoidanceBLimitDeg';

describe('zoneOfAvoidanceBLimitDeg', () => {
  it('returns bulgeDeg at galactic longitude 0', () => {
    expect(zoneOfAvoidanceBLimitDeg(0, 15, 5)).toBe(15);
  });

  it('returns anticenterDeg at galactic longitude π', () => {
    expect(zoneOfAvoidanceBLimitDeg(Math.PI, 15, 5)).toBeCloseTo(5);
  });

  it('returns the midpoint at galactic longitude π/2', () => {
    expect(zoneOfAvoidanceBLimitDeg(Math.PI / 2, 15, 5)).toBeCloseTo(10);
  });
});
