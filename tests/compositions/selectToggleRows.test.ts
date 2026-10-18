import { describe, expect, it } from 'vitest';
import { selectToggleRows } from '../../src/compositions/selectToggleRows';
import { APP_COMPOSITION } from '../../src/compositions/app';
import { layerUiContents } from '../../src/utils/layer/layerUiContents';
import { rootReducer } from '../../src/store/rootReducer';
import { setPaletteOpen } from '../../src/state/ui/uiSlice';
import type { RootState } from '../../src/store/types';

const INIT: RootState = rootReducer(undefined, { type: '@@test/init' });
// One stable array, as the panel passes it: the memo keys on its identity.
const LAYER_ROWS = layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides');

function rowById(state: RootState, id: string) {
  const row = selectToggleRows(state, LAYER_ROWS).find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

describe('selectToggleRows', () => {
  // Guards the re-render the `memo` Labels & Guides section relies on skipping.
  it('returns the same array when an unrelated slice changes', () => {
    const before = selectToggleRows(INIT, LAYER_ROWS);
    const after = selectToggleRows(rootReducer(INIT, setPaletteOpen(true)), LAYER_ROWS);
    expect(after).toBe(before);
  });

  // Read-after-write through the real reducer, for every label category and Layer row: a
  // row that reads one switch and writes another is a checkbox that refuses to flip.
  it("a row's set builds the action that flips its own value", () => {
    for (const { id } of selectToggleRows(INIT, LAYER_ROWS)) {
      const row = rowById(INIT, id);
      const next = rootReducer(INIT, row.set(!row.enabled));
      expect(rowById(next, id).enabled).toBe(!row.enabled);
    }
  });
});
