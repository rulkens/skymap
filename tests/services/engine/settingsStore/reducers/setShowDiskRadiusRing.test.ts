import { describe, it, expect } from 'vitest';

import { setShowDiskRadiusRing } from '../../../../../src/services/engine/settingsStore/reducers/setShowDiskRadiusRing';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setShowDiskRadiusRing', () => {
  it('copies-on-write the debug cluster', () => {
    const state = makeSettingsFixture();
    const next = setShowDiskRadiusRing(state, true);

    expect(next.debug.showDiskRadiusRing).toBe(true);
    // The touched cluster is a NEW reference …
    expect(next.debug).not.toBe(state.debug);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('preserves the sibling debug leaf', () => {
    const state = makeSettingsFixture();
    const before = state.debug.showPickBuffer;

    expect(setShowDiskRadiusRing(state, true).debug.showPickBuffer).toBe(before);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setShowDiskRadiusRing(state, true).debug.showDiskRadiusRing).toBe(true);
    expect(setShowDiskRadiusRing(state, false).debug.showDiskRadiusRing).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.debug.showDiskRadiusRing;

    setShowDiskRadiusRing(state, !before);

    expect(state.debug.showDiskRadiusRing).toBe(before);
  });
});
