import { describe, it, expect } from 'vitest';

import { setTierAction } from '../../../../../src/services/engine/settingsStore/actions/setTierAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectTier } from '../../../../../src/services/engine/settingsStore/selectors/selectTier';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setTierAction', () => {
  it('writes the tier through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState();

    setTierAction(store, 'large');

    expect(selectTier(store.getState())).toBe('large');
    expect(store.getState()).not.toBe(before);
  });
});
