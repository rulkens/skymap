/**
 * projectLabelCategoryVisibility — projection tests.
 *
 * A known `LabelHomes` bundle → a known concrete record, exercising every home
 * (structure category from `structures[cat].labelEnabled`, famousGalaxy from
 * `galaxyCatalogs.famousGalaxy.labelEnabled`, famousStar from
 * `starCatalogs.famousStar.labelEnabled`, the near-field bodies from
 * `bodies[id].labelEnabled`, milkyWay from the scalar).
 */

import { describe, it, expect } from 'vitest';

import { projectLabelCategoryVisibility } from '../../../src/state/settings/projectLabelCategoryVisibility';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import { isStructureId } from '../../../src/data/structure/structureIds';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { LabelHomes } from '../../../src/@types/settings/LabelHomes';
import { makeSettingsFixture } from './makeSettingsFixture';

function homesOf(state: EngineSettingsState): LabelHomes {
  return {
    structures: state.structures.items,
    galaxyCatalogs: state.galaxyCatalogs.items,
    starCatalogs: state.starCatalogs.items,
    bodies: state.bodies.items,
    milkyWayLabelEnabled: state.milkyWay.labelEnabled,
  };
}

describe('projectLabelCategoryVisibility', () => {
  it('reads structure labels from structures.items and famousGalaxy from galaxy catalogs.items', () => {
    const state = makeSettingsFixture();
    const firstStructure = LABEL_CATEGORIES.find(isStructureId)!;
    // Distinguish the two partition arms: structure label off, famous label on.
    state.structures.items[firstStructure].labelEnabled = false;
    state.galaxyCatalogs.items.famousGalaxy.labelEnabled = true;

    const record = projectLabelCategoryVisibility(homesOf(state));

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

    const record = projectLabelCategoryVisibility(homesOf(state));

    expect(record.famousGalaxy).toBe(false);
    // Structure + milkyWay labels untouched.
    for (const cat of LABEL_CATEGORIES) {
      if (cat === 'famousGalaxy') continue;
      expect(record[cat]).toBe(true);
    }
  });

  it('projects the milkyWay label axis from the bundle scalar', () => {
    const state = makeSettingsFixture();
    expect(
      projectLabelCategoryVisibility({ ...homesOf(state), milkyWayLabelEnabled: false }).milkyWay,
    ).toBe(false);
    expect(
      projectLabelCategoryVisibility({ ...homesOf(state), milkyWayLabelEnabled: true }).milkyWay,
    ).toBe(true);
  });
});
