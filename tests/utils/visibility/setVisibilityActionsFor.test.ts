/**
 * The one cue write path. A bare per-item show address flips the section switch where the
 * cluster has one and every item where it has none: the tour's `hide(['survey'])` then
 * one-at-a-time reveals rely on the second, `hide(['cosmicWebDensity'])` on the first.
 */

import { describe, it, expect } from 'vitest';
import { setVisibilityActionsFor } from '../../../src/utils/visibility/setVisibilityActionsFor';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';

const payloadsOf = (arg: Parameters<typeof setVisibilityActionsFor>[1]) =>
  setVisibilityActionsFor(INITIAL_SETTINGS, arg, false).map((a) => a.payload);

describe('setVisibilityActionsFor', () => {
  it('a bare per-item show address writes the section switch where the cluster has one', () => {
    expect(payloadsOf('cosmicWebDensity')).toEqual([
      { cluster: 'cosmicWebDensity', field: 'enabled', on: false },
    ]);
    expect(payloadsOf('starCatalog')).toEqual([
      { cluster: 'starCatalogs', field: 'enabled', on: false },
    ]);
    expect(payloadsOf('survey').map((p) => p.item)).toEqual([...GALAXY_CATALOG_IDS]);
    expect(payloadsOf('structureRing').map((p) => p.item)).toEqual([...STRUCTURE_IDS]);
  });

  it('a label address writes labelEnabled only, per item or on the cluster', () => {
    expect(payloadsOf('label:famousGalaxy')).toEqual([
      { cluster: 'galaxyCatalogs', item: 'famousGalaxy', field: 'labelEnabled', on: false },
    ]);
    expect(payloadsOf('label:milkyWay')).toEqual([
      { cluster: 'milkyWay', field: 'labelEnabled', on: false },
    ]);
  });

  it('a scoped address writes its one item, and overMs rides every write', () => {
    expect(setVisibilityActionsFor(INITIAL_SETTINGS, 'label:structure:void', true, 2000)).toEqual([
      setVisibility({
        cluster: 'structures',
        item: 'void',
        field: 'labelEnabled',
        on: true,
        overMs: 2000,
      }),
    ]);
  });
});
