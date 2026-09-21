/**
 * scopedVisibilityActions — resolves one 'family:scope' show/hide entry to its
 * targeted settings action(s): single-item dispatches for survey/structureRing
 * and per-category labels; whole-row fan-outs for the named label slices.
 */

import { describe, it, expect } from 'vitest';

import { scopedVisibilityActions } from '../../../src/services/animation/scopedVisibilityActions';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
} from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../../src/layers/structure/state/structures/slice';
import { setMilkyWayLabelEnabled } from '../../../src/layers/milkyWay/state/milkyWay/slice';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';

// The row fan-outs read only the item records; the rest is irrelevant here.
const settings = {
  galaxyCatalogs: {
    items: Object.fromEntries(
      GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
    ),
  },
  structures: {
    items: Object.fromEntries(
      STRUCTURE_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
    ),
  },
  milkyWay: { enabled: true, labelEnabled: true },
} as unknown as EngineSettingsState;

describe('scopedVisibilityActions', () => {
  it('survey:<id> dispatches one visibility action for that catalog only', () => {
    expect(scopedVisibilityActions('survey:milliquas', false, settings)).toEqual([
      setGalaxyCatalogVisible({ id: 'milliquas', enabled: false }),
    ]);
  });

  it('label:<category> dispatches one label action for that category only', () => {
    expect(scopedVisibilityActions('label:group', true, settings)).toEqual([
      setStructureLabelEnabled({ id: 'group', enabled: true }),
    ]);
  });

  it('label:milkyWay resolves to the Milky-Way label gate', () => {
    expect(scopedVisibilityActions('label:milkyWay', false, settings)).toEqual([
      setMilkyWayLabelEnabled(false),
    ]);
  });

  it('label:structure fans out over every structure category', () => {
    expect(scopedVisibilityActions('label:structure', false, settings)).toEqual(
      STRUCTURE_IDS.map((id) => setStructureLabelEnabled({ id, enabled: false })),
    );
  });
});
