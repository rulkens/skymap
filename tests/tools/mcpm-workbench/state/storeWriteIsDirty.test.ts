/**
 * storeWriteIsDirty — Viewport.tsx's render-on-demand dirty check AND its
 * interaction-priority boost trigger share this predicate, so its exclusions matter
 * twice over: the FPS-badge write must read as clean, or render-on-demand would wake
 * itself back up on every throttled push; `sim.stepCount` and the whole `histogram`
 * slice must too, or a running sim's own bookkeeping writes (every step, every
 * HISTOGRAM_INTERVAL_STEPS) would pin the interaction boost on for as long as the
 * sim runs, never letting it settle back to full quality (the regression this test
 * exists to catch — see storeWriteIsDirty.ts's own comment).
 */
import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import {
  setFps,
  setLayerEnabled,
} from '../../../../tools/mcpm-workbench/src/state/slices/viewSlice';
import { incrementStep } from '../../../../tools/mcpm-workbench/src/state/slices/simSlice';
import { recordHistogramSample } from '../../../../tools/mcpm-workbench/src/state/slices/histogramSlice';
import { storeWriteIsDirty } from '../../../../tools/mcpm-workbench/src/state/storeWriteIsDirty';

describe('storeWriteIsDirty', () => {
  it('is false for the identical snapshot', () => {
    expect(storeWriteIsDirty(defaultAppState, defaultAppState)).toBe(false);
  });

  it('is false for an fps-only write', () => {
    const next = { ...defaultAppState, view: setFps(defaultAppState.view, 42) };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(false);
  });

  it('is false for a stepCount-only write (a running sim, every step)', () => {
    const next = { ...defaultAppState, sim: incrementStep(defaultAppState.sim) };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(false);
  });

  it('is false for any histogram-only write (a running sim, every 20th step)', () => {
    const next = {
      ...defaultAppState,
      histogram: recordHistogramSample(
        defaultAppState.histogram,
        new Uint32Array(17),
        1,
        new Float32Array(1),
        20,
      ),
    };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(false);
  });

  it('is true when a real view field changes alongside fps', () => {
    const withFps = { ...defaultAppState, view: setFps(defaultAppState.view, 42) };
    const next = { ...withFps, view: setLayerEnabled(withFps.view, 'agents', true) };
    expect(storeWriteIsDirty(withFps, next)).toBe(true);
  });

  it('is true when a real sim field changes alongside stepCount', () => {
    const stepped = { ...defaultAppState, sim: incrementStep(defaultAppState.sim) };
    const next = { ...stepped, sim: { ...stepped.sim, running: !stepped.sim.running } };
    expect(storeWriteIsDirty(stepped, next)).toBe(true);
  });

  it('is true when a non-view, non-sim, non-histogram slice changes', () => {
    const next = { ...defaultAppState, grid: { ...defaultAppState.grid, showGridBox: true } };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(true);
  });
});
