/**
 * starCatalogsSlice — the per-item-vs-master-gate split `settingsReducer.test.ts`
 * used to pin at the composed-root level. Kept here: a per-catalog toggle
 * bleeding into the master `enabled` gate (or vice versa) is real behaviour a
 * bug could silently break.
 */
import { describe, it, expect } from 'vitest';

import {
  starCatalogsSlice,
  setStarCatalogVisible,
} from '../../../../src/layers/starCatalog/settings/starCatalogsSlice';

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
