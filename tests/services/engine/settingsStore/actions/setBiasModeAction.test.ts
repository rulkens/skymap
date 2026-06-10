import { describe, it, expect } from 'vitest';

import { setBiasModeAction } from '../../../../../src/services/engine/settingsStore/actions/setBiasModeAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectBiasMode } from '../../../../../src/services/engine/settingsStore/selectors/selectBiasMode';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setBiasModeAction', () => {
  it('writes the bias mode through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().bias;

    setBiasModeAction(store, 3);

    expect(selectBiasMode(store.getState())).toBe(3);
    expect(store.getState().bias).not.toBe(before);
  });
});
