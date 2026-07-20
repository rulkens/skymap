/**
 * updateFrameStats — the pure EMA folder behind the DebugPanel's always-on
 * FPS + CPU-frame-time readout.
 *
 * The load-bearing correctness here is the idle-gap guard: a render-on-demand
 * wake produces one enormous rAF interval, and folding `1000/interval` for that
 * frame into the FPS EMA would tank the average.  These tests hand-compute the
 * single EMA step (alpha = 0.1) so they stay independent of the implementation.
 */

import { describe, expect, it } from 'vitest';
import { updateFrameStats, IDLE_GAP_MS } from '../../../src/utils/perf/updateFrameStats';

describe('updateFrameStats', () => {
  it('folds a steady 16.7 ms interval toward 60 fps', () => {
    // prev.fps = 0; sample interval 16.7 ms → instantaneous fps = 1000/16.7 ≈ 59.88.
    // One EMA step with alpha 0.1: 0 * 0.9 + 59.88 * 0.1 ≈ 5.988.
    const next = updateFrameStats(
      { fps: 0, cpuMs: 0 },
      { intervalMs: 16.7, cpuMs: 4 },
    );
    expect(next.fps).toBeCloseTo((1000 / 16.7) * 0.1, 5);
    expect(next.fps).toBeGreaterThan(0);
    expect(next.fps).toBeLessThan(60);
    // cpuMs always folds: 0 * 0.9 + 4 * 0.1 = 0.4.
    expect(next.cpuMs).toBeCloseTo(0.4, 5);
  });

  it('leaves fps unchanged for an interval past the idle gap, but still updates cpuMs', () => {
    const prev = { fps: 60, cpuMs: 5 };
    const next = updateFrameStats(prev, {
      intervalMs: IDLE_GAP_MS + 500,
      cpuMs: 8,
    });
    expect(next.fps).toBe(60); // wake-frame guard: no fold.
    expect(next.cpuMs).toBeCloseTo(5 * 0.9 + 8 * 0.1, 5); // = 5.3
  });

  it('leaves fps unchanged (no div-by-zero) for a zero interval', () => {
    const prev = { fps: 42, cpuMs: 3 };
    const next = updateFrameStats(prev, { intervalMs: 0, cpuMs: 6 });
    expect(next.fps).toBe(42);
    expect(Number.isFinite(next.fps)).toBe(true);
    expect(next.cpuMs).toBeCloseTo(3 * 0.9 + 6 * 0.1, 5); // = 3.3
  });
});
