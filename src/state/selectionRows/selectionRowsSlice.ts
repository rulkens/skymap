/**
 * selectionRowsSlice — saga-owned derived display cache. The slice holds one
 * `SelectionRow | null` per slot (hover / select / focus). It is the READ
 * surface for InfoCard and any UI that needs the resolved, serializable
 * representation of a selected thing.
 *
 * The saga is the ONLY writer. It watches `SelectionState` (the raw ref Intent)
 * for changes, resolves each live ref against the engine's in-memory catalogs,
 * and calls `setSelectionRow` to land the result here. No component, no engine
 * callback, and no other saga should dispatch `setSelectionRow` — only the
 * selection-resolution saga.
 *
 * `setSelectionRow` writes a single slot by key rather than replacing the whole
 * state, so a hover resolution doesn't stomp an in-progress focus resolution.
 * The reducer is an inline Immer mutating reducer: the `selectionRows` draft arg
 * is left UNANNOTATED so RTK infers a writable Draft rather than applying the
 * readonly `SelectionRowsState` type (which would re-introduce TS2540 errors on
 * the draft assignment).
 */

import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRowsRoute } from '../../store/constants';
import type { SelectionRowsState } from '../../@types/store/SelectionRowsState';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { SelectionRow } from '../../@types/engine/SelectionRow';

// Only the focus slot carries an id: the compiler refuses a focus write without one.
type SetSelectionRowPayload =
  | { readonly slot: 'focus'; readonly row: SelectionRow | null; readonly focusId: string | null }
  | { readonly slot: Exclude<SelectionSlot, 'focus'>; readonly row: SelectionRow | null };

const selectionRowsSlice = createSlice({
  name: selectionRowsRoute,
  initialState: { hover: null, select: null, focus: null, focusId: null } as SelectionRowsState,
  reducers: {
    setSelectionRow: (selectionRows, action: PayloadAction<SetSelectionRowPayload>) => {
      // The row is an immutable projection stored as-is — the saga replaces the
      // whole slot, never mutates it in place — so re-typing it to Immer's Draft is
      // sound (no clone) and satisfies the WritableDraft slot type. RTK re-exports
      // the Draft type but not castDraft, hence the direct cast.
      const { payload } = action;
      selectionRows[payload.slot] = payload.row as Draft<SelectionRow> | null;
      if (payload.slot === 'focus') selectionRows.focusId = payload.focusId;
    },
  },
});

export const { setSelectionRow } = selectionRowsSlice.actions;

export default selectionRowsSlice.reducer;
