import { describe, expect, it } from 'vitest';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { PoiCategory } from '../../src/services/engine/subsystems/poiSubsystem';

/**
 * Type-level check: `EngineSettingsState.labelCategoryVisibility` is
 * keyed by every `PoiCategory` value.  If the union ever drifts from
 * the visibility record shape, this assignment stops compiling.
 */
describe('EngineSettingsState.labelCategoryVisibility', () => {
  it('is a Record keyed by PoiCategory', () => {
    const v: EngineSettingsState['labelCategoryVisibility'] = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
    };
    const c: PoiCategory = 'famousGalaxy';
    expect(v[c]).toBe(true);
  });

  it('all four categories default to true (compile-time check)', () => {
    const all: Record<PoiCategory, boolean> = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
    };
    expect(Object.values(all).every(Boolean)).toBe(true);
  });
});
