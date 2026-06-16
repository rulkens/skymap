import { describe, it, expect } from 'vitest';

import { setTier } from '../../../../../src/services/engine/settingsStore/reducers/setTier';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setTier', () => {
  it('copies-on-write the top-level tier', () => {
    const state = makeSettingsFixture();
    const next = setTier(state, 'large');

    expect(next.tier).toBe('large');
    // The root object is a NEW reference …
    expect(next).not.toBe(state);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('preserves a sibling cluster leaf', () => {
    const state = makeSettingsFixture();
    const next = setTier(state, 'small');

    expect(next.bias.absMagLimit).toBe(state.bias.absMagLimit);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.tier;

    setTier(state, before === 'large' ? 'small' : 'large');

    expect(state.tier).toBe(before);
  });
});
