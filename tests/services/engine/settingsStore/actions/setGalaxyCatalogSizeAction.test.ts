import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogSizeAction } from '../../../../../src/services/engine/settingsStore/actions/setGalaxyCatalogSizeAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectGalaxyCatalogSize } from '../../../../../src/services/engine/settingsStore/selectors/selectGalaxyCatalogSize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogSizeAction', () => {
  it('writes the size through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().galaxyCatalogs;

    setGalaxyCatalogSizeAction(store, 7);

    expect(selectGalaxyCatalogSize(store.getState())).toBe(7);
    // Copy-on-write propagated through the reducer: the galaxy catalogs cluster is a new
    // ref, not an in-place mutation of the original held object.
    expect(store.getState().galaxyCatalogs).not.toBe(before);
  });
});
