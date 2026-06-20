import { describe, it, expect, vi } from 'vitest';

import { createAppStore } from '../../../../src/store/createAppStore';
import { dispatchCatalogLoaded } from '../../../../src/services/engine/wiring/dispatchCatalogLoaded';
import { catalogLoaded } from '../../../../src/state/catalog/catalogLoaded';
import { Source } from '../../../../src/data/sources';

describe('dispatchCatalogLoaded', () => {
  it('dispatches the catalogLoaded event carrying the source', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    dispatchCatalogLoaded(store, Source.SDSS);
    expect(spy).toHaveBeenCalledWith(catalogLoaded({ source: Source.SDSS }));
  });

  it('dispatches one event per source independently', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    dispatchCatalogLoaded(store, Source.SDSS);
    dispatchCatalogLoaded(store, Source.TwoMRS);
    expect(spy).toHaveBeenCalledWith(catalogLoaded({ source: Source.SDSS }));
    expect(spy).toHaveBeenCalledWith(catalogLoaded({ source: Source.TwoMRS }));
  });
});
