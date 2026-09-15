import { describe, expect, it } from 'vitest';

import { percentile } from '../../../../tools/utils/perf/percentile';

describe('percentile (type-7 linear interpolation)', () => {
  it('interpolates the midpoint of an even-length array', () => {
    // r = 0.5*3 = 1.5, lo = 1, frac = 0.5 → 2 + 0.5*(3-2) = 2.5
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  // Guard beyond the brief: a single-element array puts lo at the last index,
  // where the naive formula would read values[lo+1] === undefined and produce
  // NaN (0 * (undefined - x)). The harness calls median() on frames=1 buckets,
  // so this path is hit for real.
  it('returns the sole value for a single-element array', () => {
    expect(percentile([5], 50)).toBe(5);
  });

  // p=100 also lands lo on the last index (frac 0) — same NaN trap.
  it('returns the max for p=100 without reading past the end', () => {
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });

  // Empty input is a programmer error for a dev-tool aggregator; fail loudly
  // rather than return undefined-arithmetic.
  it('throws on an empty array', () => {
    expect(() => percentile([], 50)).toThrow();
  });
});
