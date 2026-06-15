import { describe, it, expect } from 'vitest';

import { setGalaxyCatalogSize } from '../../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogSize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setGalaxyCatalogSize', () => {
  it('copies-on-write the galaxy catalogs cluster', () => {
    const state = makeSettingsFixture();
    const next = setGalaxyCatalogSize(state, 4);

    expect(next.galaxyCatalogs.sizePx).toBe(4);
    // The touched cluster is a NEW reference …
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.galaxyCatalogs.sizePx;

    setGalaxyCatalogSize(state, 4);

    expect(state.galaxyCatalogs.sizePx).toBe(before);
  });
});
