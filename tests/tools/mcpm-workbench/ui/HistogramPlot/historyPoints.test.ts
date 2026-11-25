import { describe, expect, it } from 'vitest';
import { historyPoints } from '../../../../../tools/mcpm-workbench/src/ui/HistogramPlot/utils/historyPoints';

describe('historyPoints', () => {
  it('draws nothing for an empty or single-sample history', () => {
    expect(historyPoints([], 100, 50)).toEqual([]);
    expect(historyPoints([5], 100, 50)).toEqual([]);
    expect(historyPoints([NaN, 5, NaN], 100, 50)).toEqual([]);
  });

  it('spans the width oldest to newest and scales y to the min–max, high values up', () => {
    expect(historyPoints([8, 6, 5], 100, 50)).toEqual([
      [0, 0],
      [50, (50 * 2) / 3],
      [100, 50],
    ]);
  });

  it('centres a flat history', () => {
    expect(historyPoints([5, 5], 100, 50)).toEqual([
      [0, 25],
      [100, 25],
    ]);
  });

  it('skips non-finite samples but keeps the others at their own x', () => {
    expect(historyPoints([1, NaN, 3], 100, 50)).toEqual([
      [0, 50],
      [100, 0],
    ]);
  });
});
