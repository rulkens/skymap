/**
 * `items` is typed as a complete record, so a hand-listed initial state that
 * misses a hole, or a reducer that replaces an item, slips past the compiler.
 */
import { describe, it, expect } from 'vitest';

import {
  blackHolesSlice,
  setBlackHoleLabelEnabled,
} from '../../../../../src/layers/blackHoles/state/blackHoles/slice';
import { BLACK_HOLE_SOURCE_ROWS } from '../../../../../src/layers/blackHoles/sources/blackHoleSourceRows';
import { SGR_A_STAR_ENTRY } from '../../../../../src/layers/blackHoles/sources/sgrAStar';
import type { BlackHolesSettings } from '../../../../../src/@types/settings/BlackHolesSettings';

describe('blackHolesSlice', () => {
  it('the initial blackHoles.items has a row for every black-hole id', () => {
    const { items } = blackHolesSlice.getInitialState();
    for (const [, entry] of BLACK_HOLE_SOURCE_ROWS) {
      expect(items[entry.id]).toEqual({ labelEnabled: true });
    }
  });

  it('setBlackHoleLabelEnabled writes the field, not the item', () => {
    const id = SGR_A_STAR_ENTRY.id;
    const seeded = {
      items: { [id]: { labelEnabled: true, extra: 7 } },
    } as unknown as BlackHolesSettings;
    const next = blackHolesSlice.reducer(seeded, setBlackHoleLabelEnabled({ id, enabled: false }));
    expect(next.items[id]).toEqual({ labelEnabled: false, extra: 7 });
  });
});
