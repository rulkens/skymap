/**
 * buildInitialSettings — boot-defaults assembly.
 *
 * The reason this literal was pulled out of `createEngine`: its shape can be
 * pinned without standing up the whole engine. These tests assert the contract
 * the runtime relies on at boot — the tier passes through verbatim, every
 * cluster is present, and the two registry-DERIVED item records seed exactly
 * one row per id (a drift between the id set and the seed would strand a
 * catalog/structure with no settings row, the bug the `Object.fromEntries`
 * derivation exists to prevent).
 */

import { describe, it, expect } from 'vitest';
import { buildInitialSettings } from '../../../../src/services/engine/settingsStore/buildInitialSettings';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { DEFAULT_FLOW, DEFAULT_POINT_SIZE_PX } from '../../../../src/data/defaults';

describe('buildInitialSettings', () => {
  it('passes the caller-resolved tier through verbatim (no ambient default)', () => {
    expect(buildInitialSettings({ initialTier: 'large' }).tier).toBe('large');
    expect(buildInitialSettings({ initialTier: 'small' }).tier).toBe('small');
  });

  it('seeds every settings cluster', () => {
    const s = buildInitialSettings({ initialTier: 'medium' });
    expect(Object.keys(s).sort()).toEqual(
      [
        'bias',
        'camera',
        'debug',
        'filaments',
        'flow',
        'galaxyCatalogs',
        'milkyWay',
        'structures',
        'thumbnails',
        'tier',
        'tonemap',
        'volumes',
      ].sort(),
    );
  });

  it('derives exactly one galaxy-catalog item row per id, each layer + label on', () => {
    const { items } = buildInitialSettings({ initialTier: 'medium' }).galaxyCatalogs;
    expect(Object.keys(items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    for (const id of GALAXY_CATALOG_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('derives exactly one structure item row per id, each ring + label on', () => {
    const { items } = buildInitialSettings({ initialTier: 'medium' }).structures;
    expect(Object.keys(items).sort()).toEqual([...STRUCTURE_IDS].sort());
    for (const id of STRUCTURE_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('seeds the volume-field rows (non-empty) and master gates on', () => {
    const { volumes, galaxyCatalogs, structures } = buildInitialSettings({ initialTier: 'medium' });
    expect(Object.keys(volumes.items).length).toBeGreaterThan(0);
    expect(galaxyCatalogs.enabled).toBe(true);
    expect(structures.enabled).toBe(true);
  });

  it('seeds an empty disabled-passes record (no pass disabled at boot)', () => {
    const s = buildInitialSettings({ initialTier: 'medium' });
    expect(s.debug.disabledPasses).toEqual({});
  });

  it('wires per-field defaults from data/defaults', () => {
    const s = buildInitialSettings({ initialTier: 'medium' });
    expect(s.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(s.flow).toEqual(DEFAULT_FLOW);
    // Spread, not aliased — mutating the result must not write the seed.
    expect(s.flow).not.toBe(DEFAULT_FLOW);
  });
});
