/**
 * selectionRowsSlice — the saga-owned derived cache (see SelectionRowsState).
 * `setSelectionRow` writes one slot by key, so a hover resolution never stomps
 * a focus one. The draft arg stays UNANNOTATED so RTK infers a writable Draft;
 * annotating it with the readonly state type brings back TS2540.
 */

import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRowsRoute } from '../../store/constants';
import type { SelectionRowsState } from '../../@types/store/SelectionRowsState';
import type { SetSelectionRowPayload } from '../../@types/store/SetSelectionRowPayload';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { SelectionAnchor } from '../../@types/engine/selection/SelectionAnchor';

const selectionRowsSlice = createSlice({
  name: selectionRowsRoute,
  initialState: {
    hover: null,
    select: null,
    focus: null,
    ids: { hover: null, select: null, focus: null },
  } as SelectionRowsState,
  reducers: {
    setSelectionRow: (selectionRows, action: PayloadAction<SetSelectionRowPayload>) => {
      // The row is an immutable projection stored as-is — the saga replaces the
      // whole slot, never mutates it in place — so re-typing it to Immer's Draft is
      // sound (no clone) and satisfies the WritableDraft slot type. RTK re-exports
      // the Draft type but not castDraft, hence the direct cast.
      const { payload } = action;
      selectionRows[payload.slot] = payload.row as Draft<SelectionRowBase> | null;
      selectionRows.ids[payload.slot] = payload.id as Draft<SelectionAnchor> | null;
    },
  },
});

export const { setSelectionRow } = selectionRowsSlice.actions;

export default selectionRowsSlice.reducer;
