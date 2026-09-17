import { describe, expect, it } from 'vitest';

import { featherWeight } from '../../../../tools/utils/textures/featherWeight';

const outer = { west: 0, east: 10, south: 0, north: 4 };
// Asymmetric rings: a lon ramp read against the lat ring (or vice versa) shows.
const core = { west: 2, east: 8, south: 1, north: 3 };

describe('featherWeight', () => {
  it('is 0 on and outside the outer edge, 1 inside the core, rising between', () => {
    expect(featherWeight(outer, core, 0, 2)).toBe(0);
    expect(featherWeight(outer, core, -1, 2)).toBe(0);
    expect(featherWeight(outer, core, 5, 4)).toBe(0);
    expect(featherWeight(outer, core, 5, 2)).toBe(1);
    expect(featherWeight(outer, core, 2, 2)).toBe(1);
    expect(featherWeight(outer, core, 1, 2)).toBeCloseTo(0.5);
    expect(featherWeight(outer, core, 5, 3.5)).toBeCloseTo(0.5);
    expect(featherWeight(outer, core, 0.5, 2)).toBeLessThan(featherWeight(outer, core, 1.5, 2));
  });
});
