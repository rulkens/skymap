/**
 * extrasSlice — the extra-galaxies background-scatter toggle: on/off,
 * satellite count, and an explicit "reroll" nonce (`extrasRegenerated`) that
 * forces a fresh layout without touching `count` or `enabled` — see
 * `ExtrasState`'s docblock for why the reroll is its own action rather than
 * inferred from a count/enabled change.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_EXTRAS_STATE } from '../../data/defaultExtrasState';

const extrasSlice = createSlice({
  name: 'extras',
  initialState: DEFAULT_EXTRAS_STATE,
  reducers: {
    extrasToggled: (extras, action: PayloadAction<boolean>) => {
      extras.enabled = action.payload;
    },
    extrasCountSet: (extras, action: PayloadAction<number>) => {
      extras.count = action.payload;
    },
    extrasRegenerated: (extras) => {
      extras.regenNonce += 1;
    },
  },
});

export const { extrasToggled, extrasCountSet, extrasRegenerated } = extrasSlice.actions;
export default extrasSlice.reducer;
