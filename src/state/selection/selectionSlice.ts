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
 * for, held from the command until the request has landed somewhere a reader can
 * see it. It is written only by reducers, never by a saga: it is state derived
 * from the action stream, and that is a reducer's job. Saga-side bookkeeping
 * would have to unwind the entry on every exit path, including the deferred
 * resolve that `takeLatest` cancels silently; as a reducer that cancellation
 * needs no handling at all, because the newer `requestFocus` has already
 * overwritten the slot, which is the right answer.
 *
 * ### Where the pending window ENDS, and why it is not the ref write
 *
 * `pending` exists so a reader that must not lose the target mid-resolve has
 * something to read; `selectPendingFocusId` is that read, and the URL's `focus`
 * row is its consumer. The row's precedence ladder is `pending` first, then the
 * resolved value — so the two rungs have to MEET. They do not meet at the ref.
 *
 * The URL composes from `selectionRows.focus`, the saga-owned derived cache, not
 * from the ref: only the row carries the catalog-resolved identity a galaxy id
 * needs. That row lands one action AFTER the ref, because the reconciler
 * (`watchSelectionRowsSaga`) has to be woken by the ref write to produce it. So
 * retiring `pending` on `updateSelectionFocus` opened a one-action window in
 * which the lower rung still held the PREVIOUS target and the upper rung had
 * already gone quiet.
 *
 * The window therefore closes on `setSelectionRow` — the derived row's arrival,
 * which is exactly the moment the next rung down becomes true. The alternative
 * (teach the URL row to tolerate a stale lower rung) cannot work: during the gap
 * there is nothing in the store that both says "mars" and encodes to a URL id.
 *
 * The URL is no longer the reason, and the retirement point is kept anyway.
 * `watchHashWriteSaga` now composes once per SETTLED state rather than once per
 * trigger, so nothing reads the ladder mid-hand-off and reverting this to the
 * ref write breaks no history test — that was verified, not assumed. What it
 * would break is the meaning of the field: retired at the ref, `pending` says
 * "a ref was written", which is a fact about this slice's own plumbing and is
 * true a step before any reader can act on the request. Retired at the row it
 * says what the docblock above claims it says, which is the only version a
 * second consumer could safely be written against.
 *
 * The cost is one cross-slice `addCase`: this slice now names an action of the
 * cache built from it. That is the honest shape — the baton is passed between
 * two slices, so its hand-off point is a fact about both — and it stays sound
 * because `setSelectionRow` is the SOLE writer of every row, and the reconciler
 * emits one for EVERY ref write including a deduped no-op (it takes the action,
 * not the state change), so no request can strand its `pending` entry.
 *
 * The commands and the row write are foreign actions, so they land in
 * `extraReducers`. Anything this slice needs to do on its OWN actions has to
 * ride inside their reducer instead: RTK builds `finalCaseReducers` with the
 * `reducers` entry LAST, so an `extraReducers` case for an own action type is
 * silently dropped — no warning, just a `pending` slot that never clears.
 */
import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRoute } from '../../store/constants';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import { requestFocus } from './requestFocus';
import { requestSelect } from './requestSelect';
import { setSelectionRow } from '../selectionRows/selectionRowsSlice';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

const setIfChanged =
  (slot: 'hover' | 'select' | 'focus') =>
  (selection: Draft<SelectionState>, action: PayloadAction<SelectionRef | null>) => {
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
    updateSelectionFocus: setIfChanged('focus'),
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

export const { updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection } =
  selectionSlice.actions;

export default selectionSlice.reducer;
