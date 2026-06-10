import { describe, it, expect } from 'vitest';

import { setAutoRotateAction } from '../../../../../src/services/engine/settingsStore/actions/setAutoRotateAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectAutoRotate } from '../../../../../src/services/engine/settingsStore/selectors/selectAutoRotate';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setAutoRotateAction', () => {
  it('writes the auto-rotate flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().camera;

    setAutoRotateAction(store, true);

    expect(selectAutoRotate(store.getState())).toBe(true);
    expect(store.getState().camera).not.toBe(before);
  });
});
