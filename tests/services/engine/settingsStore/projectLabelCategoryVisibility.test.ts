/**
 * projectLabelCategoryVisibility — projection tests.
 *
 * Two flavours:
 *   - Parity: the projection reproduces the legacy `deriveLabelCategoryVisibility`
 *     (the structure / famousGalaxy partition) for a known items state. This
 *     imports the SOON-TO-BE-DELETED derive helper and is Phase-3-disposable —
 *     when Phase 3 removes the helper, delete this `describe`. The self-contained
 *     cases below survive that deletion.
 *   - Self-contained: known structure + survey items Records → a known concrete
 *     record, exercising BOTH partition arms (structure category from
 *     `structures.items[cat].labelEnabled`, famousGalaxy from
 *     `surveys.items.famousGalaxy.labelEnabled`).
 */

import { describe, it, expect } from 'vitest';

import { projectLabelCategoryVisibility } from '../../../../src/services/engine/settingsStore/projectLabelCategoryVisibility';
import { deriveLabelCategoryVisibility } from '../../../../src/services/engine/helpers/deriveLabelCategoryVisibility';
import { LABEL_CATEGORIES } from '../../../../src/data/labelCategories';
import { isStructureCategory } from '../../../../src/data/structureCategories';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectLabelCategoryVisibility — parity with deriveLabelCategoryVisibility', () => {
  it('reproduces the legacy derive helper, including the famousGalaxy partition', () => {
    const state = makeSettingsFixture();
    // Hide one structure label AND the famous-galaxy label so both partition
    // arms differ from the all-on default.
    const firstStructure = LABEL_CATEGORIES.find(isStructureCategory)!;
    state.structures.items[firstStructure].labelEnabled = false;
    state.surveys.items.famousGalaxy.labelEnabled = false;

    // The legacy helper reads `state.settings.…`, so wrap the bare settings
    // fixture in the `{ settings }` shape it expects.
    expect(projectLabelCategoryVisibility(state.structures.items, state.surveys.items)).toEqual(
      deriveLabelCategoryVisibility({ settings: state }),
    );
  });
});

describe('projectLabelCategoryVisibility — self-contained', () => {
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
