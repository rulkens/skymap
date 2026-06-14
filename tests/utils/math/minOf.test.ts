import { describe, it, expect } from 'vitest';
import { minOf } from '../../../src/utils/math/minOf';

describe('minOf', () => {
  it('returns the smallest value', () => {
    expect(minOf([3, 1, 4, 1, 5], 0)).toBe(1);
  });

  it('returns the fallback for an empty array', () => {
    expect(minOf([], 42)).toBe(42);
  });

  it('ignores the fallback when the array is non-empty', () => {
    // A fallback smaller than every element must not win — it only applies
    // when there is no element to compare.
    expect(minOf([3, 4, 5], -100)).toBe(3);
  });

  it('handles negative values', () => {
    expect(minOf([-2, -7, -1], 0)).toBe(-7);
  });

  it('returns the sole element of a single-element array', () => {
    expect(minOf([9], 0)).toBe(9);
  });
});
