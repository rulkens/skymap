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
 *
 * Beside the refs sits `pending` — the durable id each request COMMAND asked
 * for, held from the command until its resolved ref arrives. It is written only
 * by reducers, never by a saga: it is state derived from the action stream, and
 * that is a reducer's job. Saga-side bookkeeping would have to unwind the entry
 * on every exit path, including the deferred resolve that `takeLatest` cancels
 * silently; as a reducer that cancellation needs no handling at all, because the
 * newer `requestFocus` has already overwritten the slot, which is the right
 * answer.
 *
 * The two commands are foreign actions, so they land in `extraReducers`. The two
 * completions are this slice's OWN actions, so their clear rides inside their
 * reducer rather than a second `addCase`: RTK builds `finalCaseReducers` with the
 * `reducers` entry LAST, so an `extraReducers` case for an own action type is
 * silently dropped — no warning, just a `pending` slot that never clears.
 */
import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRoute } from '../../store/constants';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import { requestFocus } from './requestFocus';
import { requestSelect } from './requestSelect';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

const setIfChanged =
  (slot: 'hover' | 'select' | 'focus') =>
  (selection: Draft<SelectionState>, action: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqualRef(selection[slot], action.payload)) selection[slot] = action.payload;
  };

/**
 * The resolved-ref write for a slot that has a pending twin: it retires the
 * request that asked for it. The clear is unconditional, outside the dedup
 * guard — a resolve landing on a structurally-equal ref is still a resolve, and
 * leaving `pending` set there would strand it for the rest of the session.
 * `hover` has no pending twin (there is no requestHover), which is why the slot
 * type here is narrower than `setIfChanged`'s.
 */
const resolveRef =
  (slot: 'select' | 'focus') =>
  (selection: Draft<SelectionState>, action: PayloadAction<SelectionRef | null>) => {
    setIfChanged(slot)(selection, action);
    selection.pending[slot] = null;
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
    updateSelectionSelect: resolveRef('select'),
    updateSelectionFocus: resolveRef('focus'),
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
        selection.pending.focus = action.payload;
      })
      .addCase(requestSelect, (selection, action) => {
        selection.pending.select = action.payload;
      });
  },
});

export const { updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection } =
  selectionSlice.actions;

export default selectionSlice.reducer;
