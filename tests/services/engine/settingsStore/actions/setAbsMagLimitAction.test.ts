import { describe, it, expect } from 'vitest';

import { setAbsMagLimitAction } from '../../../../../src/services/engine/settingsStore/actions/setAbsMagLimitAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectAbsMagLimit } from '../../../../../src/services/engine/settingsStore/selectors/selectAbsMagLimit';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setAbsMagLimitAction', () => {
  it('writes the abs-mag limit through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().bias;

    setAbsMagLimitAction(store, -22);

    expect(selectAbsMagLimit(store.getState())).toBe(-22);
    expect(store.getState().bias).not.toBe(before);
  });
});
