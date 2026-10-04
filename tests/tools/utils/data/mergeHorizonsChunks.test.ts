import { describe, it, expect } from 'vitest';
import { mergeHorizonsChunks } from '../../../../tools/utils/data/mergeHorizonsChunks';

const row = (jd: number) => ({ jd, xKm: jd, yKm: 0, zKm: 0 });

describe('mergeHorizonsChunks', () => {
  it('concatenating two chunks drops the shared boundary row once', () => {
    const merged = mergeHorizonsChunks([
      [row(1), row(2), row(3)],
      [row(3), row(4), row(5)],
    ]);
    expect(merged.map((r) => r.jd)).toEqual([1, 2, 3, 4, 5]);
  });
});
