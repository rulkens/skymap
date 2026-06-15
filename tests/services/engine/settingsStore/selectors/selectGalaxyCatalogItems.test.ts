import { describe, it, expect } from 'vitest';

import { selectGalaxyCatalogItems } from '../../../../../src/services/engine/settingsStore/selectors/selectGalaxyCatalogItems';
import { setGalaxyCatalogLabelEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogLabelEnabled';
import { setGalaxyCatalogVisible } from '../../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogVisible';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectGalaxyCatalogItems', () => {
  it('returns the underlying galaxy catalogs.items Record by reference', () => {
    const state = makeSettingsFixture();

    expect(selectGalaxyCatalogItems(state)).toBe(state.galaxyCatalogs.items);
  });

  it('returns the SAME ref when an unrelated leaf changes (stable-ref contract)', () => {
    const state = makeSettingsFixture();
    const before = selectGalaxyCatalogItems(state);

    // A sibling leaf on the same cluster (brightness) must not disturb items.
    const afterBrightness = { ...state, galaxyCatalogs: { ...state.galaxyCatalogs, brightness: 0.123 } };
    expect(selectGalaxyCatalogItems(afterBrightness)).toBe(before);

    // A wholly-unrelated cluster also must not disturb the items ref.
    const afterStructures = {
      ...state,
      structures: { ...state.structures, enabled: false },
    };
    expect(selectGalaxyCatalogItems(afterStructures)).toBe(before);
  });

  it('returns a NEW ref when a galaxy catalog label or visibility actually changes', () => {
    const state = makeSettingsFixture();
    const before = selectGalaxyCatalogItems(state);

    expect(selectGalaxyCatalogItems(setGalaxyCatalogLabelEnabled(state, 'famousGalaxy', false))).not.toBe(before);
    expect(selectGalaxyCatalogItems(setGalaxyCatalogVisible(state, 'sdss', false))).not.toBe(before);
  });
});
