import { describe, it, expect } from 'vitest';
import { minOf } from '../../../src/utils/math/minOf';

describe('minOf', () => {
  it('returns the smallest value', () => {
    expect(minOf([3, 1, 4, 1, 5], 0)).toBe(1);
  });

  it('returns the fallback for an empty array', () => {
    expect(minOf([], 42)).toBe(42);
  });
});
