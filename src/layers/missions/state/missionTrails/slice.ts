/** missionTrails — the missions Layer's trail overlay switch, independent of orbitTrails. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const missionTrailsSlice = createSlice({
  name: 'settings/missionTrails',
  reducerPath: 'missionTrails',
  initialState,
  reducers: {
    setMissionTrailsEnabled: (missionTrails, action: PayloadAction<boolean>) => {
      missionTrails.enabled = action.payload;
    },
  },
});

export const { setMissionTrailsEnabled } = missionTrailsSlice.actions;
