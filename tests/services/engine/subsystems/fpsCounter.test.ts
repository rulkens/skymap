/**
 * fpsCounter — verifies the rolling-window FPS math.
 *
 * We assert three behaviours:
 *   1. A single sample yields no estimate (FPS is undefined from one
 *      timestamp — you need at least one delta).
 *   2. A steady 60 Hz cadence (16.667 ms gaps) rounds to 60 fps.
 *   3. Spikes inside a fully-saturated window are smoothed by the mean.
 */

import { describe, it, expect } from 'vitest';

import { createFpsCounter } from '../../../../src/services/engine/subsystems/fpsCounter';

describe('createFpsCounter', () => {
  it('returns null for the first sample (need ≥ 2 timestamps for a delta)', () => {
    const counter = createFpsCounter(60);
    expect(counter.sample(1000)).toBeNull();
  });

  it('reports 60 fps for a steady 60 Hz cadence', () => {
    const counter = createFpsCounter(60);
    const dt = 1000 / 60; // 16.6667 ms
    let t = 0;
    let last: number | null = null;
    for (let i = 0; i < 70; i++) {
      t += dt;
      last = counter.sample(t);
    }
    expect(last).toBe(60);
  });

  it('smooths a single spike when the window is saturated', () => {
    // 60 frames at 60 Hz, then one 100 ms hitch — the rolling mean
    // should still report ~60 fps (well above 50), proving the
    // smoothing is doing its job.
    const counter = createFpsCounter(60);
    const dt = 1000 / 60;
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += dt;
      counter.sample(t);
    }
    t += 100; // single frame hitch
    const fps = counter.sample(t);
    expect(fps).not.toBeNull();
    // With a 60-frame window saturated at 60 Hz plus one 100 ms hitch,
    // mean delta ≈ (59 × 16.667 + 100) / 60 ≈ 18.06 ms → ~55 fps.
    // The exact number depends on which stale samples got evicted, but
    // it must be well above 30 (no smoothing → 10 fps) and below 60.
    expect(fps!).toBeGreaterThan(45);
    expect(fps!).toBeLessThan(60);
  });

  it('reports 30 fps for a steady 30 Hz cadence', () => {
    const counter = createFpsCounter(60);
    const dt = 1000 / 30;
    let t = 0;
    let last: number | null = null;
    for (let i = 0; i < 70; i++) {
      t += dt;
      last = counter.sample(t);
    }
    expect(last).toBe(30);
  });

  it('throws on a degenerate window size (< 2 frames)', () => {
    expect(() => createFpsCounter(1)).toThrow();
  });
});
