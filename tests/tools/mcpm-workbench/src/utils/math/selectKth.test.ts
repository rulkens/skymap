import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../../../packages/shared/src/utils/random/mulberry32';
import { selectKth } from '../../../../../../tools/mcpm-workbench/src/utils/math/selectKth';

describe('selectKth', () => {
  it('finds every rank of sorted, reversed, flat, few-valued and random inputs', () => {
    const rng = mulberry32(7);
    const n = 301;
    const inputs = [
      Array.from({ length: n }, (_, i) => i),
      Array.from({ length: n }, (_, i) => n - i),
      Array.from({ length: n }, () => 3),
      Array.from({ length: n }, () => Math.floor(rng() * 4)),
      Array.from({ length: n }, (_, i) => Math.min(i, n - i)), // organ pipe
      Array.from({ length: n }, () => rng() - 0.5),
      [5],
    ];
    for (const input of inputs) {
      const sorted = Float64Array.from(input).sort();
      for (let k = 0; k < input.length; k++) {
        const values = Float64Array.from(input);
        expect(selectKth(values, k)).toBe(sorted[k]);
        // One assertion per rank, not per element: 600k expect calls timed out under load.
        const pivot = values[k]!;
        expect(values.subarray(0, k).every((v) => v <= pivot)).toBe(true);
        expect(values.subarray(k + 1).every((v) => v >= pivot)).toBe(true);
      }
    }
  });
});
