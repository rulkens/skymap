/**
 * A drift between `GALAXY_CATALOG_IDS` and the derived item rows would
 * strand a catalog with no settings row. Not visible to the compiler.
 */
import { describe, it, expect } from 'vitest';

import { initialState } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { GALAXY_CATALOG_IDS } from '../../../../../src/data/galaxyCatalog/galaxyCatalogIds';

describe('galaxyCatalogsSlice initialState', () => {
  it('derives one item row per id, every row carrying labelEnabled', () => {
    expect(Object.keys(initialState.items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    for (const id of GALAXY_CATALOG_IDS) {
      expect(initialState.items[id]?.labelEnabled).toBe(true);
    }
    // The DESI patches boot hidden: a pencil-beam cone, a dec-band fan, and
    // the Sloan Great Wall are specialist overlays, not part of the all-sky
    // default scene.
    expect(initialState.items.desiDeep).toEqual({ enabled: false, labelEnabled: true });
    expect(initialState.items.desiWedge).toEqual({ enabled: false, labelEnabled: true });
    expect(initialState.items.desiSgw).toEqual({ enabled: false, labelEnabled: true });
  });
});
