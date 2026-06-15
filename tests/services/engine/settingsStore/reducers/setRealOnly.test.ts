import { describe, it, expect } from 'vitest';

import { setRealOnly } from '../../../../../src/services/engine/settingsStore/reducers/setRealOnly';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setRealOnly', () => {
  it('copies-on-write the galaxy catalogs cluster', () => {
    const state = makeSettingsFixture();
    const next = setRealOnly(state, !state.galaxyCatalogs.realOnly);

    expect(next.galaxyCatalogs.realOnly).toBe(!state.galaxyCatalogs.realOnly);
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.galaxyCatalogs.realOnly;

    setRealOnly(state, !before);

    expect(state.galaxyCatalogs.realOnly).toBe(before);
  });
});
