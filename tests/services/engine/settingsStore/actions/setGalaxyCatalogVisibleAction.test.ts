import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogVisibleAction } from '../../../../../src/services/engine/settingsStore/actions/setGalaxyCatalogVisibleAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectVisibleSourceMask } from '../../../../../src/services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogVisibleAction', () => {
  it('flips items[id].enabled through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().galaxyCatalogs;
    const maskBefore = selectVisibleSourceMask(store.getState());

    setGalaxyCatalogVisibleAction(store, 'sdss', false);

    expect(store.getState().galaxyCatalogs.items.sdss.enabled).toBe(false);
    // Copy-on-write propagated through the reducer.
    expect(store.getState().galaxyCatalogs).not.toBe(before);
    // The derived bitmask drops the toggled-off galaxy catalog's bit.
    expect(selectVisibleSourceMask(store.getState())).not.toBe(maskBefore);
  });
});
