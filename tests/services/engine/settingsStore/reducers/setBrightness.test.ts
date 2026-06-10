import { describe, it, expect } from 'vitest';

import { setBrightness } from '../../../../../src/services/engine/settingsStore/reducers/setBrightness';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setBrightness', () => {
  it('copies-on-write the surveys cluster', () => {
    const state = makeSettingsFixture();
    const next = setBrightness(state, 2.5);

    expect(next.surveys.brightness).toBe(2.5);
    // The touched cluster is a NEW reference …
    expect(next.surveys).not.toBe(state.surveys);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.surveys.brightness;

    setBrightness(state, 2.5);

    expect(state.surveys.brightness).toBe(before);
  });
});
