import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogLabelEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogLabelEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogLabelEnabled', () => {
  it('flips galaxy catalogs.items[id].labelEnabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every galaxy catalog seeded labelEnabled
    const next = setGalaxyCatalogLabelEnabled(state, 'famousGalaxy', false);

    expect(next.galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    expect(next.galaxyCatalogs.items).not.toBe(state.galaxyCatalogs.items);
    expect(next.galaxyCatalogs.items.famousGalaxy).not.toBe(state.galaxyCatalogs.items.famousGalaxy);
    // … but a sibling galaxy catalog row keeps its existing reference …
    expect(next.galaxyCatalogs.items.sdss).toBe(state.galaxyCatalogs.items.sdss);
    // … and a sibling cluster is untouched.
    expect(next.structures).toBe(state.structures);
  });

  it('preserves the galaxy catalog layer-visibility axis when flipping the label', () => {
    const state = makeSettingsFixture();
    const next = setGalaxyCatalogLabelEnabled(state, 'famousGalaxy', false);

    expect(next.galaxyCatalogs.items.famousGalaxy.enabled).toBe(state.galaxyCatalogs.items.famousGalaxy.enabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setGalaxyCatalogLabelEnabled(state, 'famousGalaxy', false);

    expect(state.galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(true);
  });
});
