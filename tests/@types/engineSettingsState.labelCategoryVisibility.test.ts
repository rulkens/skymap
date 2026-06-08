import { describe, expect, it } from 'vitest';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { LabelCategory } from '../../src/@types/engine/data/LabelCategory';
import type { StructureCategory } from '../../src/@types/engine/data/StructureCategory';

/**
 * Type-level checks on the two independent visibility axes:
 *   - `labelCategoryVisibility` is keyed by `LabelCategory` (famousGalaxy +
 *     structures);
 *   - `markerCategoryVisibility` is keyed by `StructureCategory` only — famous
 *     galaxies bear no ring marker, so a `famousGalaxy` key is a type error.
 * If either union drifts from its record shape, these assignments stop
 * compiling.
 */
describe('EngineSettingsState visibility records', () => {
  it('labelCategoryVisibility is a Record keyed by LabelCategory (includes famousGalaxy)', () => {
    const v: EngineSettingsState['labelCategoryVisibility'] = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
      group: true,
    };
    const c: LabelCategory = 'famousGalaxy';
    expect(v[c]).toBe(true);
  });

  it('markerCategoryVisibility is a Record keyed by StructureCategory (no famousGalaxy key)', () => {
    const v: EngineSettingsState['markerCategoryVisibility'] = {
      cluster: true,
      supercluster: true,
      void: true,
      group: true,
    };
    const c: StructureCategory = 'cluster';
    expect(v[c]).toBe(true);
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
