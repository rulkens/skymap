/**
 * selectionSlice — the identity-Intent refs. Three slots (hover/select/focus),
 * each a SelectionRef or null, with DEDUP-ON-WRITE: a write whose ref is
 * structurally equal to the current slot is a no-op, so the slot keeps its
 * reference and downstream selectors/sagas don't re-fire. Because every pick
 * builds a fresh ref object, `===` would always miss; shallowEqualRef gives the
 * structural compare a flat-primitive ref allows. This replaces the per-type
 * targetEq the old subsystem carried.
 *
 * Reducers mutate the Immer draft (the settingsSlice style), so an unchanged
 * slot is left untouched and Immer returns the same reference for it.
 */
import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRoute } from '../../store/constants';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

const setIfChanged =
  (slot: keyof SelectionState) =>
  (selection: Draft<SelectionState>, action: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqualRef(selection[slot], action.payload)) selection[slot] = action.payload;
  };

const selectionSlice = createSlice({
  name: selectionRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionState,
  reducers: {
    updateSelectionHover: setIfChanged('hover'),
    updateSelectionSelect: setIfChanged('select'),
    updateSelectionFocus: setIfChanged('focus'),
    clearSelection: (selection) => {
      selection.select = null;
      selection.focus = null;
    },
  },
});

export const { updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection } =
  selectionSlice.actions;

export default selectionSlice.reducer;
