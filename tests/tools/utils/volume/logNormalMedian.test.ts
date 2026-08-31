import { describe, expect, it } from 'vitest';

import { logNormalMedian } from '../../../../tools/utils/volume/logNormalMedian';

describe('logNormalMedian', () => {
  it('returns mean when std is 0 (no spread — median equals the point value)', () => {
    expect(logNormalMedian(4, 0)).toBeCloseTo(4, 10);
  });

  it('returns 0 when mean is 0, without evaluating 0/0', () => {
    expect(logNormalMedian(0, 0)).toBe(0);
    expect(logNormalMedian(0, 5)).toBe(0);
  });

  it('matches the closed form for a known std/mean ratio', () => {
    // std/mean = 1 → median = mean / sqrt(2)
    expect(logNormalMedian(10, 10)).toBeCloseTo(10 / Math.sqrt(2), 10);
  });

  it('is monotonically shrinking as std grows relative to a fixed mean', () => {
    const mean = 10;
    const stds = [0, 1, 5, 20, 100];
    const medians = stds.map((std) => logNormalMedian(mean, std));
    for (let i = 1; i < medians.length; i++) {
      expect(medians[i]!).toBeLessThan(medians[i - 1]!);
    }
    // Never exceeds the mean, and never goes negative.
    for (const m of medians) {
      expect(m).toBeLessThanOrEqual(mean);
      expect(m).toBeGreaterThanOrEqual(0);
    }
  });
});
