/**
 * INITIAL_SETTINGS — boot-defaults assembly.
 *
 * The reason this literal was pulled out of `createEngine`: its shape can be
 * pinned without standing up the whole engine. These tests assert the contract
 * the runtime relies on at boot — the two registry-DERIVED item records hold
 * exactly one row per id (a drift between the id set and the rows would strand
 * a catalog/structure with no settings row, the bug the `Object.fromEntries`
 * derivation exists to prevent).
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import {
  DEFAULT_FLOW,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_GLOW_OVERLAP,
  DEFAULT_STAR_SIZE_PX,
} from '../../../src/data/defaults';
import { DEFAULT_REFINE_THRESHOLD } from '../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';

describe('INITIAL_SETTINGS', () => {
  it('derives one galaxy-catalog item row per id, enabled from registry visible', () => {
    const { items } = INITIAL_SETTINGS.galaxyCatalogs;
    expect(Object.keys(items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    // `enabled` comes from each source's SOURCE_REGISTRY `visible` field — the
    // registry is the single source of truth for default visibility — while
    // `labelEnabled` is uniformly true. Every galaxy catalog ships visible:true
    // except the DESI patches — DesiDeep (pencil-beam cone), DesiWedge (dec-band
    // fan), and DesiSgw (Sloan Great Wall) — all boot hidden, so those are the
    // rows that start enabled:false.
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
    const { items } = INITIAL_SETTINGS.structures;
    expect(Object.keys(items).sort()).toEqual([...STRUCTURE_IDS].sort());
    for (const id of STRUCTURE_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('wires per-field defaults from data/defaults', () => {
    expect(INITIAL_SETTINGS.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(INITIAL_SETTINGS.starCatalogs.sizePx).toBe(DEFAULT_STAR_SIZE_PX);
    expect(INITIAL_SETTINGS.starCatalogs.brightness).toBe(DEFAULT_STAR_BRIGHTNESS);
    expect(INITIAL_SETTINGS.starCatalogs.refineThreshold).toBe(DEFAULT_REFINE_THRESHOLD);
    expect(INITIAL_SETTINGS.starCatalogs.glowOverlap).toBe(DEFAULT_STAR_GLOW_OVERLAP);
    expect(INITIAL_SETTINGS.flow).toEqual(DEFAULT_FLOW);
  });
});
