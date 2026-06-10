import { describe, it, expect } from 'vitest';

import { setShowPickBufferAction } from '../../../../../src/services/engine/settingsStore/actions/setShowPickBufferAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectShowPickBuffer } from '../../../../../src/services/engine/settingsStore/selectors/selectShowPickBuffer';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setShowPickBufferAction', () => {
  it('writes the show-pick-buffer flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().debug;

    setShowPickBufferAction(store, true);

    expect(selectShowPickBuffer(store.getState())).toBe(true);
    expect(store.getState().debug).not.toBe(before);
  });
});
