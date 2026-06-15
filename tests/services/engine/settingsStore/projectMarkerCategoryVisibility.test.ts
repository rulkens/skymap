/**
 * projectMarkerCategoryVisibility — projection tests.
 *
 * A known items Record → a known concrete record: the projection packs each
 * structure category's ring flag into a flat record keyed by StructureCategory.
 */

import { describe, it, expect } from 'vitest';

import { projectMarkerCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectMarkerCategoryVisibility';
import { STRUCTURE_CATEGORIES } from '../../../../src/data/structure/structureCategories';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectMarkerCategoryVisibility', () => {
  it('packs each category ring flag into a flat record keyed by StructureCategory', () => {
    const state = makeSettingsFixture();
    // Make the projection observable: hide the first category, show the rest.
    const [hidden] = STRUCTURE_CATEGORIES;
    if (!hidden) throw new Error('expected at least one structure category');
    state.structures.items[hidden].enabled = false;

    const record = projectMarkerCategoryVisibility(state.structures.items);

    // Keyed by exactly the structure categories.
    expect(Object.keys(record).sort()).toEqual([...STRUCTURE_CATEGORIES].sort());
    // The hidden category is false; every other is true.
    for (const cat of STRUCTURE_CATEGORIES) {
      expect(record[cat]).toBe(cat !== hidden);
    }
  });
});
