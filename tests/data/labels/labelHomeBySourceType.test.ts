/**
 * The dispatch table's whole contract: for a category of each label-bearing
 * source type, the `write` action's payload lands where `read` looks. A
 * miswired row (reading `structures` but writing the galaxy-catalog setter)
 * would leave a checkbox that visibly refuses to flip — this is the test that
 * catches it, and no compiler check can.
 */
import { describe, it, expect } from 'vitest';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../../src/data/labels/labelHomeBySourceType';
import { SOURCE_REGISTRY } from '../../../src/data/sources';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import settingsReducer from '../../../src/state/settings/settingsSlice';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { LabelCategory } from '../../../src/@types/engine/data/LabelCategory';
import type { LabelHomes } from '../../../src/@types/settings/LabelHomes';

function homesOf(settings: EngineSettingsState): LabelHomes {
  return {
    structures: settings.structures.items,
    galaxyCatalogs: settings.galaxyCatalogs.items,
    starCatalogs: settings.starCatalogs.items,
    bodies: settings.bodies.items,
    milkyWayLabelEnabled: settings.milkyWay.labelEnabled,
  };
}

function homeFor(cat: LabelCategory) {
  const entry = Object.values(SOURCE_REGISTRY).find((e) => e.id === cat)!;
  return LABEL_HOME_BY_SOURCE_TYPE[entry.type as keyof typeof LABEL_HOME_BY_SOURCE_TYPE];
}

describe('LABEL_HOME_BY_SOURCE_TYPE', () => {
  it('round-trips read-after-write for every label-bearing category', () => {
    for (const cat of LABEL_CATEGORIES) {
      const home = homeFor(cat);
      expect(home, `no label home for '${cat}'`).toBeDefined();

      const off = settingsReducer(buildInitialSettings(), home.write(cat, false));
      expect(home.read(homesOf(off), cat), `'${cat}' should read false`).toBe(false);

      const on = settingsReducer(off, home.write(cat, true));
      expect(home.read(homesOf(on), cat), `'${cat}' should read true`).toBe(true);
    }
  });
});
