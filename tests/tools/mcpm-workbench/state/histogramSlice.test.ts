/**
 * histogramSlice — `setSampleRandomly` used to be a plain field write with a
 * Viewport subscriber dispatching a separate `resetHistogram()` on the edge;
 * T12 folded the reset into the reducer itself (task-12-brief.md). This
 * covers the one thing a compiler can't catch: the fold still clears
 * history/counts, not just the flag.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultHistogramSlice,
  histogramSlice,
} from '../../../../tools/mcpm-workbench/src/state/histogram/histogramSlice';

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
