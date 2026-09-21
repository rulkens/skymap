/**
 * The per-catalog toggles and the master `enabled` gate share one cluster and
 * read alike, so a reducer writing the wrong one is invisible to the compiler.
 */
import { describe, it, expect } from 'vitest';

import {
  starCatalogsSlice,
  setStarCatalogVisible,
} from '../../../../../src/layers/starCatalog/state/starCatalogs/slice';

describe('starCatalogsSlice', () => {
  it('setStarCatalogVisible toggles a catalog’s enabled', () => {
    // gaiaStars seeds enabled: true from SOURCE_REGISTRY[Source.GaiaStars].visible;
    // the per-item reducer flips one row without touching the master gate.
    const next = starCatalogsSlice.reducer(
      starCatalogsSlice.getInitialState(),
      setStarCatalogVisible({ id: 'gaiaStars', enabled: false }),
    );
    expect(next.items.gaiaStars.enabled).toBe(false);
    expect(next.enabled).toBe(true);
  });
});
