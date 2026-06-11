import { describe, it, expect } from 'vitest';

import { setShowPickBuffer } from '../../../../../src/services/engine/settingsStore/reducers/setShowPickBuffer';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setShowPickBuffer', () => {
  it('copies-on-write the debug cluster', () => {
    const state = makeSettingsFixture();
    const next = setShowPickBuffer(state, true);

    expect(next.debug.showPickBuffer).toBe(true);
    // The touched cluster is a NEW reference …
    expect(next.debug).not.toBe(state.debug);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling debug leaf', () => {
    const state = makeSettingsFixture();
    const before = state.debug.showDiskRadiusRing;

    expect(setShowPickBuffer(state, true).debug.showDiskRadiusRing).toBe(before);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setShowPickBuffer(state, true).debug.showPickBuffer).toBe(true);
    expect(setShowPickBuffer(state, false).debug.showPickBuffer).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.debug.showPickBuffer;

    setShowPickBuffer(state, !before);

    expect(state.debug.showPickBuffer).toBe(before);
  });
});
