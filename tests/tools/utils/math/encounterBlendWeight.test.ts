import { describe, expect, it } from 'vitest';

import { encounterBlendWeight } from '../../../../tools/utils/math/encounterBlendWeight';
import { encounterBlendWeightRate } from '../../../../tools/utils/math/encounterBlendWeightRate';

describe('encounterBlendWeight', () => {
  it('is 1 inside ±20 d, 0 outside ±120 d and monotone between', () => {
    expect(encounterBlendWeight(0)).toBe(1);
    expect(encounterBlendWeight(-20)).toBe(1);
    expect(encounterBlendWeight(120)).toBe(0);
    expect(encounterBlendWeight(-300)).toBe(0);
    let prev = 1;
    for (let d = 20; d <= 120; d += 0.5) {
      const w = encounterBlendWeight(d);
      expect(w).toBeLessThanOrEqual(prev);
      expect(encounterBlendWeight(-d)).toBe(w);
      prev = w;
    }
  });

  it('has a rate that matches its finite difference', () => {
    for (const d of [-90, -40, 35, 70, 110]) {
      const h = 1e-4;
      const fd = (encounterBlendWeight(d + h) - encounterBlendWeight(d - h)) / (2 * h);
      expect(encounterBlendWeightRate(d)).toBeCloseTo(fd, 6);
    }
  });
});
