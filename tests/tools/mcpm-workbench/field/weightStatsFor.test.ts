import { describe, expect, it } from 'vitest';
import { weightStatsFor } from '../../../../tools/mcpm-workbench/src/field/weightStatsFor';

describe('weightStatsFor', () => {
  it('reports min, median and max whatever the order', () => {
    expect(weightStatsFor(new Float32Array([4, 1, 3, 2]))).toEqual({ min: 1, median: 2.5, max: 4 });
  });

  it('takes the middle value of an odd-length set', () => {
    expect(weightStatsFor(new Float32Array([0.5, 8, 2]))).toEqual({ min: 0.5, median: 2, max: 8 });
  });
});
