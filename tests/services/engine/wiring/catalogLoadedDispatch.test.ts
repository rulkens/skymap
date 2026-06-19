import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../../src/store/createAppStore';
import { dispatchCatalogLoaded } from '../../../../src/services/engine/wiring/dispatchCatalogLoaded';
import { Source } from '../../../../src/data/sources';
import { dataStatusRoute } from '../../../../src/store/constants';

describe('dispatchCatalogLoaded', () => {
  it('records the generation in dataStatus.catalogGen', () => {
    const { store } = createAppStore();
    dispatchCatalogLoaded(store, Source.SDSS, 4);
    expect(store.getState()[dataStatusRoute].catalogGen[Source.SDSS]).toBe(4);
  });

  it('overwrites with a later generation for the same source', () => {
    const { store } = createAppStore();
    dispatchCatalogLoaded(store, Source.SDSS, 1);
    dispatchCatalogLoaded(store, Source.SDSS, 2);
    expect(store.getState()[dataStatusRoute].catalogGen[Source.SDSS]).toBe(2);
  });

  it('records generations for different sources independently', () => {
    const { store } = createAppStore();
    dispatchCatalogLoaded(store, Source.SDSS, 3);
    dispatchCatalogLoaded(store, Source.TwoMRS, 7);
    expect(store.getState()[dataStatusRoute].catalogGen[Source.SDSS]).toBe(3);
    expect(store.getState()[dataStatusRoute].catalogGen[Source.TwoMRS]).toBe(7);
  });
});
