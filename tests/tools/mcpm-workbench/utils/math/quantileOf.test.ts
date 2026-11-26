import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';
import { quantileOf } from '../../../../../tools/mcpm-workbench/src/utils/math/quantileOf';

// Type-7 read straight off the sorted array: the definition quantileOf must match.
function sortedQuantile(input: readonly number[], q: number): number {
  const sorted = Float64Array.from(input).sort();
  const r = q * (sorted.length - 1);
  const lo = Math.floor(r);
  const frac = r - lo;
  return frac === 0 ? sorted[lo]! : sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!);
}

describe('quantileOf', () => {
  it('equals the quantile read off the sorted values', () => {
    const rng = mulberry32(11);
    for (const n of [1, 2, 3, 4, 10, 101, 1000]) {
      const inputs = [
        Array.from({ length: n }, () => (rng() - 0.5) * 1000),
        Array.from({ length: n }, () => Math.floor(rng() * 3)),
      ];
      for (const input of inputs) {
        for (const q of [0, 0.25, 0.5, 0.75, 0.97, 1, rng()]) {
          expect(quantileOf(Float64Array.from(input), q)).toBe(sortedQuantile(input, q));
        }
      }
    }
  });

  it('places a NaN last, as a typed sort does', () => {
    const input = [3, NaN, 1, 2];

    expect(quantileOf(Float64Array.from(input), 0.5)).toBe(sortedQuantile(input, 0.5));
    expect(quantileOf(Float64Array.from(input), 1)).toBeNaN();
  });
});
