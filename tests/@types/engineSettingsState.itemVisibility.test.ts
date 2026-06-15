import { describe, expect, it } from 'vitest';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { LabelCategory } from '../../src/@types/engine/data/LabelCategory';
import type { StructureCategory } from '../../src/@types/engine/data/StructureCategory';
import type { GalaxyCatalogId } from '../../src/@types/engine/data/GalaxyCatalogId';

/**
 * Type-level checks on the per-item visibility homes:
 *   - `galaxyCatalogs.items` is keyed by `GalaxyCatalogId`, each row carrying the galaxy catalog
 *     layer axis (`enabled`) + the text-label axis (`labelEnabled`) — the
 *     famous-galaxy catalog is where the curated-atlas name visibility lives;
 *   - `structures.items` is keyed by `StructureCategory`, each row carrying the
 *     ring axis (`enabled`) + the label axis (`labelEnabled`) — famous galaxies
 *     bear no ring, so a `famousGalaxy` key here is a type error.
 * If either union drifts from its record shape, these assignments stop
 * compiling.
 */
describe('EngineSettingsState item visibility', () => {
  it('galaxyCatalogs.items carries the famous-galaxy label axis', () => {
    const v: EngineSettingsState['galaxyCatalogs']['items'] = {
      synthetic: { enabled: true, labelEnabled: true },
      sdss: { enabled: true, labelEnabled: true },
      '2mrs': { enabled: true, labelEnabled: true },
      glade: { enabled: true, labelEnabled: true },
      famousGalaxy: { enabled: true, labelEnabled: true },
      milliquas: { enabled: true, labelEnabled: true },
    };
    const c: GalaxyCatalogId = 'famousGalaxy';
    expect(v[c].labelEnabled).toBe(true);
  });

  it('structures.items is a Record keyed by StructureCategory (no famousGalaxy key)', () => {
    const v: EngineSettingsState['structures']['items'] = {
      cluster: { enabled: true, labelEnabled: true },
      supercluster: { enabled: true, labelEnabled: true },
      void: { enabled: true, labelEnabled: true },
      group: { enabled: true, labelEnabled: true },
    };
    const c: StructureCategory = 'cluster';
    expect(v[c].enabled).toBe(true);
    expect(v[c].labelEnabled).toBe(true);
    // 'famousGalaxy' is not a StructureCategory, so it is absent from the record.
    expect('famousGalaxy' in v).toBe(false);
  });

  it('all label categories default to true (compile-time check)', () => {
    const all: Record<LabelCategory, boolean> = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
      group: true,
    };
    expect(Object.values(all).every(Boolean)).toBe(true);
  });
});
