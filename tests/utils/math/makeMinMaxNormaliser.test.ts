import { describe, it, expect } from 'vitest';
import { makeMinMaxNormaliser } from '../../../src/utils/math/makeMinMaxNormaliser';

const identity = (x: number) => x;

describe('makeMinMaxNormaliser', () => {
  it('maps the min to 0 and the max to 1', () => {
    const n = makeMinMaxNormaliser([10, 20, 30], identity);
    expect(n(10)).toBe(0);
    expect(n(30)).toBe(1);
  });

  it('linearly interpolates interior values', () => {
    const n = makeMinMaxNormaliser([0, 100], identity);
    expect(n(25)).toBeCloseTo(0.25, 10);
  });

  it('applies the transform before normalising (log space)', () => {
    // log10 over [1, 100] spans [0, 2]; 10 sits at the midpoint.
    const n = makeMinMaxNormaliser([1, 100], Math.log10);
    expect(n(10)).toBeCloseTo(0.5, 10);
  });

  it('returns full weight for an empty sample set', () => {
    const n = makeMinMaxNormaliser([], identity);
    expect(n(0)).toBe(1);
    expect(n(999)).toBe(1);
  });

  it('returns full weight when every sample is equal (no divide-by-zero)', () => {
    const n = makeMinMaxNormaliser([5, 5, 5], identity);
    expect(n(5)).toBe(1);
  });

  it('returns full weight for a single-sample set', () => {
    const n = makeMinMaxNormaliser([7], identity);
    expect(n(7)).toBe(1);
  });
});
