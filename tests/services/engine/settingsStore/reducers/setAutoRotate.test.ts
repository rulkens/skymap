import { describe, it, expect } from 'vitest';

import { setAutoRotate } from '../../../../../src/services/engine/settingsStore/reducers/setAutoRotate';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setAutoRotate', () => {
  it('copies-on-write the camera cluster', () => {
    const state = makeSettingsFixture();
    const next = setAutoRotate(state, true);

    expect(next.camera.autoRotate).toBe(true);
    // The touched cluster is a NEW reference …
    expect(next.camera).not.toBe(state.camera);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setAutoRotate(state, true).camera.autoRotate).toBe(true);
    expect(setAutoRotate(state, false).camera.autoRotate).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.camera.autoRotate;

    setAutoRotate(state, !before);

    expect(state.camera.autoRotate).toBe(before);
  });
});
