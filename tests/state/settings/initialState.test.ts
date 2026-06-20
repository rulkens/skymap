/**
 * buildInitialSettings — boot-defaults assembly.
 *
 * The reason this literal was pulled out of `createEngine`: its shape can be
 * pinned without standing up the whole engine. These tests assert the contract
 * the runtime relies on at boot — every cluster is present, and the two
 * registry-DERIVED item records seed exactly one row per id (a drift between the
 * id set and the seed would strand a catalog/structure with no settings row, the
 * bug the `Object.fromEntries` derivation exists to prevent). The data tier is
 * NOT a settings field (it lives in its own root slice), so it is absent here.
 */

import { describe, it, expect } from 'vitest';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { seedVolumeFields } from '../../../src/data/volume/volumeFieldDefaults';
import { DEFAULT_FLOW, DEFAULT_POINT_SIZE_PX } from '../../../src/data/defaults';

describe('buildInitialSettings', () => {
  it('seeds every settings cluster (no flat-root tier field)', () => {
    const s = buildInitialSettings();
    expect(Object.keys(s).sort()).toEqual(
      [
        'bias',
        'debug',
        'filaments',
        'flow',
        'galaxyCatalogs',
        'milkyWay',
        'structures',
        'thumbnails',
        'tonemap',
        'volumes',
      ].sort(),
    );
  });

  it('derives exactly one galaxy-catalog item row per id, each layer + label on', () => {
    const { items } = buildInitialSettings().galaxyCatalogs;
    expect(Object.keys(items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    for (const id of GALAXY_CATALOG_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('derives exactly one structure item row per id, each ring + label on', () => {
    const { items } = buildInitialSettings().structures;
    expect(Object.keys(items).sort()).toEqual([...STRUCTURE_IDS].sort());
    for (const id of STRUCTURE_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('seeds the volume-field rows from seedVolumeFields and master gates on', () => {
    const { volumes, galaxyCatalogs, structures } = buildInitialSettings();
    expect(volumes.items).toEqual(seedVolumeFields());
    expect(galaxyCatalogs.enabled).toBe(true);
    expect(structures.enabled).toBe(true);
  });

  it('seeds an empty disabled-passes record (no pass disabled at boot)', () => {
    const s = buildInitialSettings();
    expect(s.debug.disabledPasses).toEqual({});
  });

  it('wires per-field defaults from data/defaults', () => {
    const s = buildInitialSettings();
    expect(s.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(s.flow).toEqual(DEFAULT_FLOW);
    // Spread, not aliased — mutating the result must not write the seed.
    expect(s.flow).not.toBe(DEFAULT_FLOW);
  });
});
