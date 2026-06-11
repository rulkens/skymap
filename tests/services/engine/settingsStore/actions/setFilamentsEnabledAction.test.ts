import { describe, it, expect } from 'vitest';

import { setFilamentsEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setFilamentsEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectFilamentsEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectFilamentsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFilamentsEnabledAction', () => {
  it('writes the filaments-enabled flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().filaments;

    setFilamentsEnabledAction(store, false);

    expect(selectFilamentsEnabled(store.getState())).toBe(false);
    expect(store.getState().filaments).not.toBe(before);
  });
});
