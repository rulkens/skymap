import { describe, expect, it } from 'vitest';
import { weightStatsFor } from '../../../../src/catalog/weights/weightStatsFor';

describe('weightStatsFor', () => {
  it('takes the middle value of an odd-length set', () => {
    expect(weightStatsFor(new Float32Array([0.5, 8, 2]))).toEqual({ min: 0.5, median: 2, max: 8 });
  });
});
