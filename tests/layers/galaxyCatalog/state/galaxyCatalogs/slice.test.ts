/**
 * A drift between `GALAXY_CATALOG_IDS` and the derived item rows would
 * strand a catalog with no settings row; a hardcoded `enabled: true` would
 * silently override a registry entry that asks to boot hidden. Neither
 * failure mode is visible to the compiler.
 */
import { describe, it, expect } from 'vitest';

import { initialState } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { GALAXY_CATALOG_IDS } from '../../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { SOURCE_ENTRIES } from '../../../../../src/data/sourceEntries';

describe('galaxyCatalogsSlice initialState', () => {
  it('derives one item row per id, enabled from registry visible', () => {
    expect(Object.keys(initialState.items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    for (const id of GALAXY_CATALOG_IDS) {
      const entry = SOURCE_ENTRIES.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(initialState.items[id]).toEqual({ enabled: entry!.visible, labelEnabled: true });
    }
    // The DESI patches boot hidden: a pencil-beam cone, a dec-band fan, and
    // the Sloan Great Wall are specialist overlays, not part of the all-sky
    // default scene.
    expect(initialState.items.desiDeep).toEqual({ enabled: false, labelEnabled: true });
    expect(initialState.items.desiWedge).toEqual({ enabled: false, labelEnabled: true });
    expect(initialState.items.desiSgw).toEqual({ enabled: false, labelEnabled: true });
  });
});
