/**
 * histogramSlice — `setSampleRandomly` resets the slice in the reducer itself;
 * this covers what a compiler can't: it clears history and counts, not just the flag.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultHistogramSlice,
  histogramSlice,
} from '../../../../../../tools/mcpm-workbench/src/state/histogram/histogramSlice';

describe('histogramSlice setSampleRandomly', () => {
  it('resets counts/history/meanLogTraceAtPoints on a toggle edge', () => {
    const dirty = {
      ...defaultHistogramSlice,
      meanLogTraceAtPoints: 3.5,
      history: [{ stepCount: 40, meanLogTraceAtPoints: 3.5 }],
    };
    const next = histogramSlice.reducer(dirty, histogramSlice.actions.setSampleRandomly(true));
    expect(next.sampleRandomly).toBe(true);
    expect(next.history).toEqual([]);
    expect(Number.isNaN(next.meanLogTraceAtPoints)).toBe(true);
  });
});
