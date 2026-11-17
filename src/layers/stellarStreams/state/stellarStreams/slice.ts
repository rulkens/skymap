/**
 * stellarStreams — the streams' settings cluster. `setVisibility` writes both switches (the
 * toggle row and the label cues), so the reducers here only tune the two looks.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { StellarStreamsLook } from '../../streaks/@types/StellarStreamsLook';
import { initialState } from './initialState';

export const stellarStreamsSlice = createSlice({
  name: 'settings/stellarStreams',
  reducerPath: 'stellarStreams',
  initialState,
  reducers: {
    setStellarStreamsLook: (
      stellarStreams,
      action: PayloadAction<{ look: 'streak' | 'haze'; patch: Partial<StellarStreamsLook> }>,
    ) => {
      Object.assign(stellarStreams[action.payload.look], action.payload.patch);
    },
    resetStellarStreamsLooks: (stellarStreams) => {
      stellarStreams.streak = initialState.streak;
      stellarStreams.haze = initialState.haze;
    },
  },
});

export const { setStellarStreamsLook, resetStellarStreamsLooks } = stellarStreamsSlice.actions;
