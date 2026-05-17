import { describe, it, expect } from 'vitest';
import { percentileOf } from '../../../../tools/utils/math/percentile';

/**
 * `percentileOf` finds the largest index in a pre-sorted (ascending)
 * Float64Array whose value is ≤ the query, then converts that rank to
 * a 0–100 percentile.  No interpolation between adjacent breakpoints;
 * the callers only need it for ranking comparisons.
 */
describe('percentileOf', () => {
  it('returns 0 for the smallest value', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(1, sorted)).toBe(0);
  });

  it('returns 100 for the largest value', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(5, sorted)).toBe(100);
  });

  it('returns 50 for the median in an odd-length array', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(3, sorted)).toBe(50);
  });

  it('returns the rank of the largest value ≤ query', () => {
    const sorted = new Float64Array([0, 10, 20, 30, 40]);
    // 25 ≤ 20 is false; largest index with sorted[i] ≤ 25 is i=2 (value 20).
    // pct = 2 / 4 * 100 = 50.
    expect(percentileOf(25, sorted)).toBe(50);
  });

  it('returns 100 for a value above the max', () => {
    const sorted = new Float64Array([1, 2, 3]);
    expect(percentileOf(999, sorted)).toBe(100);
  });

  it('clamps to index 0 for a value below the min', () => {
    const sorted = new Float64Array([10, 20, 30]);
    // Binary search initialises lo=0; loop never advances.  Result: 0%.
    expect(percentileOf(-5, sorted)).toBe(0);
  });
});
