import { describe, it, expect } from 'vitest';

import { setRealOnlyAction } from '../../../../../src/services/engine/settingsStore/actions/setRealOnlyAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectRealOnly } from '../../../../../src/services/engine/settingsStore/selectors/selectRealOnly';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setRealOnlyAction', () => {
  it('writes the real-only flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().surveys;
    const next = !before.realOnly;

    setRealOnlyAction(store, next);

    expect(selectRealOnly(store.getState())).toBe(next);
    expect(store.getState().surveys).not.toBe(before);
  });
});
