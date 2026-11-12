/**
 * selectionSlice — the identity-Intent refs (hover/select/focus) plus `pending`,
 * the durable id each request command asked for. Writes DEDUP: a structurally
 * equal ref leaves the slot untouched, so downstream selectors don't re-fire.
 *
 * `pending` retires on `setSelectionRow`, not on the ref write: the derived row
 * lands one action later, and retiring earlier left readers a gap with neither.
 * LANDMINE: RTK puts `reducers` LAST, so an `extraReducers` case for this
 * slice's OWN action is silently dropped; own-action logic rides in its reducer.
 */
import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRoute } from '../../store/constants';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import { requestFocus } from './requestFocus';
import { requestSelect } from './requestSelect';
import { setSelectionRow } from '../selectionRows/selectionRowsSlice';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { Transition } from '../../@types/navigation/Transition';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

const setIfChanged =
  (slot: 'hover' | 'select' | 'focus') =>
  (selection: Draft<SelectionState>, action: PayloadAction<SelectionRefBase | null>) => {
    if (!shallowEqualRef(selection[slot], action.payload)) selection[slot] = action.payload;
  };

const selectionSlice = createSlice({
  name: selectionRoute,
  initialState: {
    hover: null,
    select: null,
    focus: null,
    pending: { select: null, focus: null },
  } as SelectionState,
  reducers: {
    updateSelectionHover: setIfChanged('hover'),
    updateSelectionSelect: setIfChanged('select'),
    // The transition rides as `meta`: the reducer never reads it, only the
    // tween saga's decision does; a gesture defaults to a fly.
    updateSelectionFocus: {
      reducer: setIfChanged('focus'),
      prepare: (ref: SelectionRefBase | null, transition: Transition = 'fly') => ({
        payload: ref,
        meta: { transition },
      }),
    },
    // An absent id's request ends with no ref write: re-putting the current ref
    // would re-fly the camera (watchFocusTweenSaga acts on the action).
    requestRetired: (
      selection,
      action: PayloadAction<{ slot: keyof SelectionState['pending'] }>,
    ) => {
      selection.pending[action.payload.slot] = null;
    },
    clearSelection: (selection) => {
      selection.select = null;
      selection.focus = null;
      selection.pending.select = null;
      selection.pending.focus = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(requestFocus, (selection, action) => {
        selection.pending.focus = action.payload.id;
      })
      .addCase(requestSelect, (selection, action) => {
        selection.pending.select = action.payload;
      })
      // The derived row has landed, so the request that asked for it is over.
      // `hover` is excluded because it has no pending twin (there is no
      // requestHover) — and the hover row is written at pointer-pick rate, so
      // routing it here would clear a live focus request on a mouse move.
      .addCase(setSelectionRow, (selection, action) => {
        if (action.payload.slot !== 'hover') selection.pending[action.payload.slot] = null;
      });
  },
});

export const {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  requestRetired,
  clearSelection,
} = selectionSlice.actions;

export default selectionSlice.reducer;
