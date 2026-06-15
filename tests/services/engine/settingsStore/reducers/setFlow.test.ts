import { describe, it, expect } from 'vitest';

import { setFlow } from '../../../../../src/services/engine/settingsStore/reducers/setFlow';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFlow', () => {
  it('merges a partial patch onto the flow slice', () => {
    const state = makeSettingsFixture();
    const next = setFlow(state, { enabled: true, intensity: 0.5 });

    expect(next.flow.enabled).toBe(true);
    expect(next.flow.intensity).toBe(0.5);
  });

  it('preserves untouched leaves on the flow slice', () => {
    const state = makeSettingsFixture();
    const before = state.flow;
    const next = setFlow(state, { intensity: 0.42 });

    // A leaf the patch didn't touch keeps its prior value.
    expect(next.flow.mode).toBe(before.mode);
    expect(next.flow.count).toBe(before.count);
    expect(next.flow.enabled).toBe(before.enabled);
  });

  it('copies-on-write the flow cluster (new top-level + new flow object)', () => {
    const state = makeSettingsFixture();
    const next = setFlow(state, { wander: 0.3 });

    expect(next).not.toBe(state);
    expect(next.flow).not.toBe(state.flow);
  });

  it('leaves sibling clusters at their existing reference', () => {
    const state = makeSettingsFixture();
    const next = setFlow(state, { flowSpeed: 0.01 });

    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
    expect(next.volumes).toBe(state.volumes);
  });

  it('stores the raw patch verbatim (no clamps)', () => {
    const state = makeSettingsFixture();
    // Values intentionally outside any GPU-safe bound — the reducer must not
    // clamp; clampFlowParams at the renderer is the single home for that.
    const next = setFlow(state, { count: 1e9, trail: -5 });

    expect(next.flow.count).toBe(1e9);
    expect(next.flow.trail).toBe(-5);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.flow.intensity;

    setFlow(state, { intensity: 0.99 });

    expect(state.flow.intensity).toBe(before);
  });
});
