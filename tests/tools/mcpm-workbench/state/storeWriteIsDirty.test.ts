/**
 * storeWriteIsDirty — Viewport.tsx's render-on-demand dirty check. The one case
 * worth its own test is the FPS-badge exclusion: the frame loop's own `setFps`
 * write must read as clean, or render-on-demand would wake itself back up on
 * every throttled push (a live feedback loop, not just a wasted frame).
 */
import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import {
  setFps,
  setLayerEnabled,
} from '../../../../tools/mcpm-workbench/src/state/slices/viewSlice';
import { storeWriteIsDirty } from '../../../../tools/mcpm-workbench/src/state/storeWriteIsDirty';

describe('storeWriteIsDirty', () => {
  it('is false for the identical snapshot', () => {
    expect(storeWriteIsDirty(defaultAppState, defaultAppState)).toBe(false);
  });

  it('is false for an fps-only write', () => {
    const next = { ...defaultAppState, view: setFps(defaultAppState.view, 42) };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(false);
  });

  it('is true when a real view field changes alongside fps', () => {
    const withFps = { ...defaultAppState, view: setFps(defaultAppState.view, 42) };
    const next = { ...withFps, view: setLayerEnabled(withFps.view, 'agents', true) };
    expect(storeWriteIsDirty(withFps, next)).toBe(true);
  });

  it('is true when a non-view slice changes', () => {
    const next = { ...defaultAppState, sim: { ...defaultAppState.sim, agentCount: 999 } };
    expect(storeWriteIsDirty(defaultAppState, next)).toBe(true);
  });
});
