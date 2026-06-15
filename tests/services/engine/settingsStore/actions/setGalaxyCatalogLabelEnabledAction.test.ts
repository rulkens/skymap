import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogLabelEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setGalaxyCatalogLabelEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectGalaxyCatalogItems } from '../../../../../src/services/engine/settingsStore/selectors/selectGalaxyCatalogItems';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogLabelEnabledAction', () => {
  it('flips galaxy catalogs.items[id].labelEnabled through the reducer and changes the items ref', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectGalaxyCatalogItems(store.getState());

    setGalaxyCatalogLabelEnabledAction(store, 'famousGalaxy', false);

    expect(store.getState().galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(false);
    expect(selectGalaxyCatalogItems(store.getState())).not.toBe(before);
  });
});
