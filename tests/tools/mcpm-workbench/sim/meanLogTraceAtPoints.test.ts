/**
 * Hand-computed cases for the one home of the "in-grid density sample ->
 * mean log trace" fold that dataPointHistogram.ts (CLI) and
 * histogramSlice.ts (live UI) both compose from.
 */
import { describe, expect, it } from 'vitest';
import { meanLogTraceAtPoints } from '../../../../tools/mcpm-workbench/src/sim/meanLogTraceAtPoints';

describe('meanLogTraceAtPoints', () => {
  it('averages log1p over all-in-grid samples: log1p(e-1)=1, log1p(0)=0 -> mean 0.5', () => {
    expect(meanLogTraceAtPoints([Math.E - 1, 0], 2)).toBeCloseTo(0.5, 10);
  });

  it('excludes negative (out-of-grid sentinel) entries from both the sum and the divisor', () => {
    // Sentinel present in the array, but sampledCount (1) already reflects
    // only the one real sample -- matches histogram.wesl's own counter.
    expect(meanLogTraceAtPoints([-1, Math.E - 1], 1)).toBeCloseTo(1, 10);
  });

  it('returns NaN when nothing was sampled in-grid', () => {
    expect(Number.isNaN(meanLogTraceAtPoints([], 0))).toBe(true);
    expect(Number.isNaN(meanLogTraceAtPoints([-1, -1], 0))).toBe(true);
  });

  it('accepts a typed array the same way it accepts a plain array', () => {
    // Float32Array precision loses ~e-9 on Math.E - 1; a f32-appropriate
    // tolerance, not the f64 precision the other cases assert.
    const densities = new Float32Array([-1, Math.E - 1, 0]);
    expect(meanLogTraceAtPoints(densities, 2)).toBeCloseTo(0.5, 6);
  });
});
