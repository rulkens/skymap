/**
 * buildInitialSettings — boot-defaults assembly.
 *
 * The reason this literal was pulled out of `createEngine`: its shape can be
 * pinned without standing up the whole engine. These tests assert the contract
 * the runtime relies on at boot — the two registry-DERIVED item records seed
 * exactly one row per id (a drift between the id set and the seed would strand a
 * catalog/structure with no settings row, the bug the `Object.fromEntries`
 * derivation exists to prevent).
 */

import { describe, it, expect } from 'vitest';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import {
  DEFAULT_FLOW,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_SIZE_PX,
} from '../../../src/data/defaults';

describe('buildInitialSettings', () => {
  it('derives one galaxy-catalog item row per id, enabled seeded from registry visible', () => {
    const { items } = buildInitialSettings().galaxyCatalogs;
    expect(Object.keys(items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    // `enabled` is seeded from each source's SOURCE_REGISTRY `visible` field —
    // the registry is the single source of truth for default visibility — while
    // `labelEnabled` is uniformly true. Every galaxy catalog ships visible:true
    // except the DESI patches — DesiDeep (pencil-beam cone), DesiWedge (dec-band
    // fan), and DesiSgw (Sloan Great Wall) — all boot hidden, so those are the
    // rows that seed enabled:false.
    for (const id of GALAXY_CATALOG_IDS) {
      const entry = SOURCE_ENTRIES.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(items[id]).toEqual({ enabled: entry!.visible, labelEnabled: true });
    }
    expect(items.desiDeep).toEqual({ enabled: false, labelEnabled: true });
    expect(items.desiWedge).toEqual({ enabled: false, labelEnabled: true });
    expect(items.desiSgw).toEqual({ enabled: false, labelEnabled: true });
  });

  it('derives exactly one structure item row per id, each ring + label on', () => {
    const { items } = buildInitialSettings().structures;
    expect(Object.keys(items).sort()).toEqual([...STRUCTURE_IDS].sort());
    for (const id of STRUCTURE_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('wires per-field defaults from data/defaults', () => {
    const s = buildInitialSettings();
    expect(s.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(s.starCatalogs.sizePx).toBe(DEFAULT_STAR_SIZE_PX);
    expect(s.starCatalogs.brightness).toBe(DEFAULT_STAR_BRIGHTNESS);
    expect(s.flow).toEqual(DEFAULT_FLOW);
    // Spread, not aliased — mutating the result must not write the seed.
    expect(s.flow).not.toBe(DEFAULT_FLOW);
  });
});
