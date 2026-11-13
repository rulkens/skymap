/**
 * skySlice — the sky view's readouts plus what the last search while standing found below the
 * horizon. `entry` and `view` come from the frame's sky readout row, which dispatches only news,
 * so their reducers are plain assigns. `belowHorizon` feeds the sky HUD's "Skip to when it
 * rises" or its never-rises line (R12); only `watchRequestViewSaga` sets it, and standing ending
 * (`view` going null) or a new entry clears it, since a rise is only true of the spot it was
 * searched from.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { enterSky } from './enterSky';
import { NO_SKY_ENTRY } from '../../data/sky/noSkyEntry';
import type { SkyBelowHorizon } from '../../@types/sky/SkyBelowHorizon';
import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';
import type { SkyView } from '../../@types/engine/SkyView';
import type { SkySliceState } from '../../@types/store/SkySliceState';

const initialState: SkySliceState = { entry: NO_SKY_ENTRY, view: null, belowHorizon: null };

const skySlice = createSlice({
  name: 'sky',
  initialState,
  reducers: {
    skyEntryReported: (state, action: PayloadAction<SkyEntryFacts>) => {
      state.entry = action.payload;
    },
    skyViewReported: (state, action: PayloadAction<SkyView>) => {
      state.view = action.payload;
      if (action.payload === null) state.belowHorizon = null;
    },
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

export const { skyEntryReported, skyViewReported, skyBelowHorizonSet } = skySlice.actions;

export default skySlice.reducer;
