import { describe, it, expect } from 'vitest';

import { setFilamentsEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setFilamentsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFilamentsEnabled', () => {
  it('copies-on-write the filaments cluster', () => {
    const state = makeSettingsFixture();
    const next = setFilamentsEnabled(state, false);

    expect(next.filaments.enabled).toBe(false);
    // The touched cluster is a NEW reference …
    expect(next.filaments).not.toBe(state.filaments);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('preserves the sibling intensity leaf on the shared cluster', () => {
    const state = makeSettingsFixture();
    const next = setFilamentsEnabled(state, false);

    expect(next.filaments.intensity).toBe(state.filaments.intensity);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setFilamentsEnabled(state, true).filaments.enabled).toBe(true);
    expect(setFilamentsEnabled(state, false).filaments.enabled).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.filaments.enabled;

    setFilamentsEnabled(state, !before);

    expect(state.filaments.enabled).toBe(before);
  });
});
