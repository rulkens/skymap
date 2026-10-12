/**
 * arrivalSlice — the boot link's arrival, from parse to reveal. Only the boot
 * read and `arrivalSaga` write it; a later hash change never does, so
 * navigation cannot re-arm the veil or `ready`.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ArrivalState } from '../../@types/state/arrival/ArrivalState';
import type { LinkIntent } from '../../@types/url/LinkIntent';

const initialState: ArrivalState = { status: 'pending' };

const arrivalSlice = createSlice({
  name: 'arrival',
  initialState,
  reducers: {
    // The intent rides the action for `arrivalSaga` to take; the slice keeps
    // only the status.
    arrivalPending: (_arrival, _action: PayloadAction<LinkIntent>): ArrivalState => ({
      status: 'pending',
    }),
    arrived: (): ArrivalState => ({ status: 'arrived' }),
    arrivalFailed: (
      _arrival,
      action: PayloadAction<NonNullable<ArrivalState['reason']>>,
    ): ArrivalState => ({ status: 'failed', reason: action.payload }),
  },
});

export const { arrivalPending, arrived, arrivalFailed } = arrivalSlice.actions;

export default arrivalSlice.reducer;
