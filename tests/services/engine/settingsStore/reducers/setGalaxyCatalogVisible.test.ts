import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogVisible } from '../../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogVisible';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogVisible', () => {
  it('flips items[id].enabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every galaxy catalog seeded enabled
    const next = setGalaxyCatalogVisible(state, 'sdss', false);

    expect(next.galaxyCatalogs.items.sdss.enabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    expect(next.galaxyCatalogs.items).not.toBe(state.galaxyCatalogs.items);
    expect(next.galaxyCatalogs.items.sdss).not.toBe(state.galaxyCatalogs.items.sdss);
    // … but a sibling galaxy catalog row keeps its existing reference …
    expect(next.galaxyCatalogs.items['2mrs']).toBe(state.galaxyCatalogs.items['2mrs']);
    // … and a sibling cluster is untouched.
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('preserves the galaxy catalog row label axis when flipping visibility', () => {
    const state = makeSettingsFixture();
    const next = setGalaxyCatalogVisible(state, 'sdss', false);

    expect(next.galaxyCatalogs.items.sdss.labelEnabled).toBe(state.galaxyCatalogs.items.sdss.labelEnabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setGalaxyCatalogVisible(state, 'sdss', false);

    expect(state.galaxyCatalogs.items.sdss.enabled).toBe(true);
  });
});
