import { describe, expect, it } from 'vitest';
import { selectLayerSwitchRows } from '../../../src/state/settings/selectLayerSwitchRows';
import { APP_LAYER_SWITCH_ROWS } from '../../../src/compositions/appLayerSwitchRows';
import { setGalaxyCatalogVisible } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { rootReducer } from '../../../src/store/rootReducer';
import { stateAfter } from '../../fixtures/stateAfter';
import type { RootState } from '../../../src/store/types';

function rowById(state: RootState, id: string) {
  const row = selectLayerSwitchRows(state, APP_LAYER_SWITCH_ROWS).find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

const flip = (state: RootState, id: string, on: boolean): RootState =>
  rowById(state, id).set(on).reduce(rootReducer, state);

describe('selectLayerSwitchRows', () => {
  // Read-after-write through the real reducer: a row that reads one switch and writes another
  // is a switch that refuses to flip.
  it("a row's set flips its own value, both ways, for every Layer", () => {
    const init = stateAfter();
    for (const { id, enabled } of selectLayerSwitchRows(init, APP_LAYER_SWITCH_ROWS)) {
      const flipped = flip(init, id, !enabled);
      expect(rowById(flipped, id).enabled, id).toBe(!enabled);
      expect(rowById(flip(flipped, id, enabled), id).enabled, id).toBe(enabled);
    }
  });

  // Galaxies have no section switch: the row stands for every catalog, as the panel's master does.
  it('a Layer without a section switch is on while any item shows, and its flip writes every item', () => {
    const onlySdss = stateAfter(
      ...GALAXY_CATALOG_IDS.map((id) => setGalaxyCatalogVisible({ id, enabled: id === 'sdss' })),
    );
    expect(rowById(onlySdss, 'survey').enabled).toBe(true);
    const off = flip(onlySdss, 'survey', false);
    expect(Object.values(off.settings.galaxyCatalogs.items).some((item) => item.enabled)).toBe(
      false,
    );
    const on = flip(off, 'survey', true);
    expect(Object.values(on.settings.galaxyCatalogs.items).every((item) => item.enabled)).toBe(
      true,
    );
  });
});
