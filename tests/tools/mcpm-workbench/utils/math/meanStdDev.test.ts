import { describe, expect, it } from 'vitest';
import { meanStdDev } from '../../../../../tools/mcpm-workbench/src/utils/math/meanStdDev';

describe('meanStdDev', () => {
  it('gives a spread of 0 for one row', () => {
    expect(meanStdDev(new Float32Array([0.042]))).toEqual({
      mean: Math.fround(0.042),
      stdDev: 0,
    });
  });

  it('is the population standard deviation', () => {
    expect(meanStdDev(new Float32Array([2, 4, 4, 4, 5, 5, 7, 9]))).toEqual({ mean: 5, stdDev: 2 });
  });

  // Float32 steps by 65536 at 1e12; the sum of squares (~3e24) loses the ~3e9 variance.
  it('keeps the spread of values around 1e12', () => {
    const step = 65536;
    const base = Math.fround(1e12);
    const { mean, stdDev } = meanStdDev(new Float32Array([base, base + step, base + 2 * step]));
    expect(mean).toBe(base + step);
    expect(stdDev).toBeCloseTo(step * Math.sqrt(2 / 3), 6);
  });
});
