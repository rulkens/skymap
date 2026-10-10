/** missionTrails — core's sampled-craft trail overlay, independent of orbitTrails. */

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
    // The exhibit timeline's craft switch; the takeover bracket restores it on exit.
    setMissionEmphasis: (missionTrails, action: PayloadAction<string | null>) => {
      missionTrails.emphasis = action.payload;
    },
  },
});

export const { setMissionTrailsEnabled, setMissionEmphasis } = missionTrailsSlice.actions;
