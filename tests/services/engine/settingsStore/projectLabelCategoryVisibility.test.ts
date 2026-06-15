/**
 * projectLabelCategoryVisibility — projection tests.
 *
 * Known structure + galaxy catalog items Records (plus the milkyWay scalar) → a
 * known concrete record, exercising ALL three arms (structure category from
 * `structures.items[cat].labelEnabled`, famousGalaxy from
 * `galaxyCatalogs.items.famousGalaxy.labelEnabled`, milkyWay from the scalar
 * third argument).
 */

import { describe, it, expect } from 'vitest';

import { projectLabelCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectLabelCategoryVisibility';
import { LABEL_CATEGORIES } from '../../../../src/data/structure/labelCategories';
import { isStructureId } from '../../../../src/data/structure/structureIds';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectLabelCategoryVisibility', () => {
  it('reads structure labels from structures.items and famousGalaxy from galaxy catalogs.items', () => {
    const state = makeSettingsFixture();
    const firstStructure = LABEL_CATEGORIES.find(isStructureId)!;
    // Distinguish the two partition arms: structure label off, famous label on.
    state.structures.items[firstStructure].labelEnabled = false;
    state.galaxyCatalogs.items.famousGalaxy.labelEnabled = true;

    const record = projectLabelCategoryVisibility(
      state.structures.items,
      state.galaxyCatalogs.items,
      state.milkyWay.labelEnabled,
    );

    // Keyed by exactly the label categories (structures + famousGalaxy + milkyWay).
    expect(Object.keys(record).sort()).toEqual([...LABEL_CATEGORIES].sort());
    // The structure arm: hidden category reads false.
    expect(record[firstStructure]).toBe(false);
    // The galaxy catalog arm: famousGalaxy reads its galaxy-catalog-row labelEnabled (true).
    expect(record.famousGalaxy).toBe(true);
    // Every other structure label stays at its all-on default.
    for (const cat of LABEL_CATEGORIES) {
      if (cat === firstStructure || cat === 'famousGalaxy') continue;
      expect(record[cat]).toBe(true);
    }
  });

  it('reflects a famousGalaxy label toggle independently of structure labels', () => {
    const state = makeSettingsFixture();
    state.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;

    const record = projectLabelCategoryVisibility(
      state.structures.items,
      state.galaxyCatalogs.items,
      state.milkyWay.labelEnabled,
    );

    expect(record.famousGalaxy).toBe(false);
    // Structure + milkyWay labels untouched.
    for (const cat of LABEL_CATEGORIES) {
      if (cat === 'famousGalaxy') continue;
      expect(record[cat]).toBe(true);
    }
  });

  it('projects the milkyWay label axis from the third argument', () => {
    const state = makeSettingsFixture();
    expect(
      projectLabelCategoryVisibility(state.structures.items, state.galaxyCatalogs.items, false)
        .milkyWay,
    ).toBe(false);
    expect(
      projectLabelCategoryVisibility(state.structures.items, state.galaxyCatalogs.items, true)
        .milkyWay,
    ).toBe(true);
  });
});
