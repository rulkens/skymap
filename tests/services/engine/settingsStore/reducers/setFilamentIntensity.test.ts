import { describe, it, expect } from 'vitest';

import { setFilamentIntensity } from '../../../../../src/services/engine/settingsStore/reducers/setFilamentIntensity';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFilamentIntensity', () => {
  it('copies-on-write the filaments cluster', () => {
    const state = makeSettingsFixture();
    const next = setFilamentIntensity(state, 0.4);

    expect(next.filaments.intensity).toBe(0.4);
    // The touched cluster is a NEW reference …
    expect(next.filaments).not.toBe(state.filaments);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling enabled leaf on the shared cluster', () => {
    const state = makeSettingsFixture();
    const next = setFilamentIntensity(state, 0.4);

    expect(next.filaments.enabled).toBe(state.filaments.enabled);
  });

  it('stores the raw value without clamping', () => {
    const state = makeSettingsFixture();

    // The [0, 1] clamp lives at the renderer (clampFilamentIntensity); the
    // reducer records intent verbatim, out-of-range values included.
    expect(setFilamentIntensity(state, 1.5).filaments.intensity).toBe(1.5);
    expect(setFilamentIntensity(state, -0.2).filaments.intensity).toBe(-0.2);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.filaments.intensity;

    setFilamentIntensity(state, before + 0.1);

    expect(state.filaments.intensity).toBe(before);
  });
});
