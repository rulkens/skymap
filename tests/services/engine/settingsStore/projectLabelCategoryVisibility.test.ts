/**
 * projectLabelCategoryVisibility — projection tests.
 *
 * Known structure + survey items Records → a known concrete record, exercising
 * BOTH partition arms (structure category from `structures.items[cat].labelEnabled`,
 * famousGalaxy from `surveys.items.famousGalaxy.labelEnabled`).
 */

import { describe, it, expect } from 'vitest';

import { projectLabelCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectLabelCategoryVisibility';
import { LABEL_CATEGORIES } from '../../../../src/data/labelCategories';
import { isStructureCategory } from '../../../../src/data/structureCategories';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectLabelCategoryVisibility', () => {
  it('reads structure labels from structures.items and famousGalaxy from surveys.items', () => {
    const state = makeSettingsFixture();
    const firstStructure = LABEL_CATEGORIES.find(isStructureCategory)!;
    // Distinguish the two partition arms: structure label off, famous label on.
    state.structures.items[firstStructure].labelEnabled = false;
    state.surveys.items.famousGalaxy.labelEnabled = true;

    const record = projectLabelCategoryVisibility(state.structures.items, state.surveys.items);

    // Keyed by exactly the label categories (structures + famousGalaxy).
    expect(Object.keys(record).sort()).toEqual([...LABEL_CATEGORIES].sort());
    // The structure arm: hidden category reads false.
    expect(record[firstStructure]).toBe(false);
    // The survey arm: famousGalaxy reads its survey-row labelEnabled (true).
    expect(record.famousGalaxy).toBe(true);
    // Every other structure label stays at its all-on default.
    for (const cat of LABEL_CATEGORIES) {
      if (cat === firstStructure || cat === 'famousGalaxy') continue;
      expect(record[cat]).toBe(true);
    }
  });

  it('reflects a famousGalaxy label toggle independently of structure labels', () => {
    const state = makeSettingsFixture();
    state.surveys.items.famousGalaxy.labelEnabled = false;

    const record = projectLabelCategoryVisibility(state.structures.items, state.surveys.items);

    expect(record.famousGalaxy).toBe(false);
    // Structure labels untouched.
    for (const cat of LABEL_CATEGORIES) {
      if (cat === 'famousGalaxy') continue;
      expect(record[cat]).toBe(true);
    }
  });
});
