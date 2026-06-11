import { describe, it, expect } from 'vitest';

import { setRealOnly } from '../../../../../src/services/engine/settingsStore/reducers/setRealOnly';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setRealOnly', () => {
  it('copies-on-write the surveys cluster', () => {
    const state = makeSettingsFixture();
    const next = setRealOnly(state, !state.surveys.realOnly);

    expect(next.surveys.realOnly).toBe(!state.surveys.realOnly);
    expect(next.surveys).not.toBe(state.surveys);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.surveys.realOnly;

    setRealOnly(state, !before);

    expect(state.surveys.realOnly).toBe(before);
  });
});
