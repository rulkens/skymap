import { describe, it, expect } from 'vitest';

import { setFilamentIntensityAction } from '../../../../../src/services/engine/settingsStore/actions/setFilamentIntensityAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectFilamentIntensity } from '../../../../../src/services/engine/settingsStore/selectors/selectFilamentIntensity';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFilamentIntensityAction', () => {
  it('writes the filament intensity through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().filaments;

    setFilamentIntensityAction(store, 0.3);

    expect(selectFilamentIntensity(store.getState())).toBe(0.3);
    expect(store.getState().filaments).not.toBe(before);
  });
});
