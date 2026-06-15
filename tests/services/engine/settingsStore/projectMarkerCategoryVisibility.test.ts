/**
 * projectMarkerCategoryVisibility — projection tests.
 *
 * A known items Record → a known concrete record: the projection packs each
 * structure category's ring flag into a flat record keyed by StructureId.
 */

import { describe, it, expect } from 'vitest';

import { projectMarkerCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectMarkerCategoryVisibility';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectMarkerCategoryVisibility', () => {
  it('packs each category ring flag into a flat record keyed by StructureId', () => {
    const state = makeSettingsFixture();
    // Make the projection observable: hide the first category, show the rest.
    const [hidden] = STRUCTURE_IDS;
    if (!hidden) throw new Error('expected at least one structure category');
    state.structures.items[hidden].enabled = false;

    const record = projectMarkerCategoryVisibility(state.structures.items);

    // Keyed by exactly the structure ids.
    expect(Object.keys(record).sort()).toEqual([...STRUCTURE_IDS].sort());
    // The hidden category is false; every other is true.
    for (const cat of STRUCTURE_IDS) {
      expect(record[cat]).toBe(cat !== hidden);
    }
  });
});
