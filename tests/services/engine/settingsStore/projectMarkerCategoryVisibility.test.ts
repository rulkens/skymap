/**
 * projectMarkerCategoryVisibility — projection tests.
 *
 * Two flavours:
 *   - Parity: the projection reproduces the legacy `deriveMarkerCategoryVisibility`
 *     for a known items state. This imports the SOON-TO-BE-DELETED derive helper
 *     and is Phase-3-disposable — when Phase 3 removes the helper, delete this
 *     `describe`. The self-contained cases below survive that deletion.
 *   - Self-contained: a known items Record → a known concrete record, so the
 *     suite still proves the projection after the parity block is gone.
 */

import { describe, it, expect } from 'vitest';

import { projectMarkerCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectMarkerCategoryVisibility';
import { deriveMarkerCategoryVisibility } from '../../../../src/services/engine/helpers/deriveMarkerCategoryVisibility';
import { STRUCTURE_CATEGORIES } from '../../../../src/data/structureCategories';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectMarkerCategoryVisibility — parity with deriveMarkerCategoryVisibility', () => {
  it('reproduces the legacy derive helper for a mixed items state', () => {
    // Hide one category's ring; leave the rest visible.
    const state = makeSettingsFixture();
    const [firstCategory] = STRUCTURE_CATEGORIES;
    if (!firstCategory) throw new Error('expected at least one structure category');
    state.structures.items[firstCategory].enabled = false;

    // The legacy helper reads `state.settings.…`, so wrap the bare settings
    // fixture in the `{ settings }` shape it expects.
    expect(projectMarkerCategoryVisibility(state.structures.items)).toEqual(
      deriveMarkerCategoryVisibility({ settings: state }),
    );
  });
});

describe('projectMarkerCategoryVisibility — self-contained', () => {
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
