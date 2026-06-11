import { describe, it, expect } from 'vitest';

import { setVolumesEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setVolumesEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setVolumesEnabled', () => {
  it('copies-on-write the volumes cluster', () => {
    const state = makeSettingsFixture();
    const next = setVolumesEnabled(state, !state.volumes.enabled);

    expect(next.volumes.enabled).toBe(!state.volumes.enabled);
    // The touched cluster is a NEW reference …
    expect(next.volumes).not.toBe(state.volumes);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling items Record ref on the shared cluster', () => {
    const state = makeSettingsFixture();
    const next = setVolumesEnabled(state, !state.volumes.enabled);

    // A master toggle must NOT rebuild items — that ref-stability is what keeps
    // the per-field rows selector stable when only the master flips.
    expect(next.volumes.items).toBe(state.volumes.items);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setVolumesEnabled(state, true).volumes.enabled).toBe(true);
    expect(setVolumesEnabled(state, false).volumes.enabled).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.volumes.enabled;

    setVolumesEnabled(state, !before);

    expect(state.volumes.enabled).toBe(before);
  });
});
