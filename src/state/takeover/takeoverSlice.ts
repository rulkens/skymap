/**
 * takeoverSlice — which source (a tour or a view), if any, currently owns the
 * scene. `runTakeover` is the sole writer, via `takeoverStarted`/`takeoverEnded`
 * (`takeoverActions.ts`) — the same external-action-plus-`extraReducers` split
 * `selectionSlice` uses for `requestFocus`/`requestSelect`.
 */
import { createSlice } from '@reduxjs/toolkit';

import { takeoverStarted, takeoverEnded } from './takeoverActions';
import type { TakeoverState } from '../../@types/takeover/TakeoverState';

const initialState: TakeoverState = { active: null };

const takeoverSlice = createSlice({
  name: 'takeover',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(takeoverStarted, (state, action) => {
        state.active = action.payload;
      })
      .addCase(takeoverEnded, (state) => {
        state.active = null;
      });
  },
});

export default takeoverSlice.reducer;
