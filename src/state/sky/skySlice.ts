/**
 * skySlice — what the last search while standing found below the horizon, for the sky HUD's
 * "Skip to when it rises" or its never-rises line (R12). `watchRequestViewSaga` is its one
 * writer; a new entry clears it, since a rise is only true of the spot it was searched from.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { enterSky } from './enterSky';
import type { SkyBelowHorizon } from '../../@types/sky/SkyBelowHorizon';

const initialState: { belowHorizon: SkyBelowHorizon | null } = { belowHorizon: null };

const skySlice = createSlice({
  name: 'sky',
  initialState,
  reducers: {
    skyBelowHorizonSet: (state, action: PayloadAction<SkyBelowHorizon | null>) => {
      state.belowHorizon = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(enterSky, (state) => {
      state.belowHorizon = null;
    });
  },
});

export const { skyBelowHorizonSet } = skySlice.actions;

export default skySlice.reducer;
