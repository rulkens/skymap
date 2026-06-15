import { describe, it, expect } from 'vitest';

import { setExposure } from '../../../../../src/services/engine/settingsStore/reducers/setExposure';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setExposure', () => {
  it('copies-on-write the tonemap cluster', () => {
    const state = makeSettingsFixture();
    const next = setExposure(state, 7.5);

    expect(next.tonemap.exposure).toBe(7.5);
    // The touched cluster is a NEW reference …
    expect(next.tonemap).not.toBe(state.tonemap);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('stores the raw value verbatim — no clamp (the bound lives at clampExposure)', () => {
    const state = makeSettingsFixture();

    // A value far outside the post-process pass's HDR-safe [0.05, 16] range is
    // stored as-is; clamping is the renderer's job, not the settings path's.
    expect(setExposure(state, 1e9).tonemap.exposure).toBe(1e9);
    expect(setExposure(state, 0).tonemap.exposure).toBe(0);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.tonemap.exposure;

    setExposure(state, 7.5);

    expect(state.tonemap.exposure).toBe(before);
  });
});
