import { describe, expect, it } from 'vitest';
import { selectToggleRows } from '../../src/compositions/selectToggleRows';
import { rootReducer } from '../../src/store/rootReducer';
import { setPaletteOpen } from '../../src/state/ui/uiSlice';
import type { LayerSettingsRow } from '../../src/@types/engine/layer/LayerSettingsRow';
import type { RootState } from '../../src/store/types';

const INIT: RootState = rootReducer(undefined, { type: '@@test/init' });
const NO_LAYER_ROWS: readonly LayerSettingsRow[] = [];

function rowById(state: RootState, id: string) {
  const row = selectToggleRows(state, NO_LAYER_ROWS).find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

describe('selectToggleRows', () => {
  // Guards the re-render the `memo` Labels & Guides section relies on skipping.
  it('returns the same array when an unrelated slice changes', () => {
    const before = selectToggleRows(INIT, NO_LAYER_ROWS);
    const after = selectToggleRows(rootReducer(INIT, setPaletteOpen(true)), NO_LAYER_ROWS);
    expect(after).toBe(before);
  });

  it("a row's set builds the action that flips its own value", () => {
    const labelRowId = selectToggleRows(INIT, NO_LAYER_ROWS)[0]!.id;
    for (const id of [labelRowId, 'toggle-orbit-trails']) {
      const row = rowById(INIT, id);
      const next = rootReducer(INIT, row.set(!row.enabled));
      expect(rowById(next, id).enabled).toBe(!row.enabled);
    }
  });
});
