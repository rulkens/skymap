import { describe, it, expect } from 'vitest';

import { setExposureAction } from '../../../../../src/services/engine/settingsStore/actions/setExposureAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectExposure } from '../../../../../src/services/engine/settingsStore/selectors/selectExposure';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setExposureAction', () => {
  it('writes the exposure through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().tonemap;

    setExposureAction(store, 6.5);

    expect(selectExposure(store.getState())).toBe(6.5);
    expect(store.getState().tonemap).not.toBe(before);
  });
});
