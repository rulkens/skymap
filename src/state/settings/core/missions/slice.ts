/** missions — core's sampled-craft cluster: the trail overlay (independent of orbitTrails) and the selected craft. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const missionsSlice = createSlice({
  name: 'settings/missions',
  reducerPath: 'missions',
  initialState,
  reducers: {
    setMissionTrailsEnabled: (missions, action: PayloadAction<boolean>) => {
      missions.trails = action.payload;
    },
    // The exhibit timeline's craft switch; the takeover bracket restores it on exit.
    setMissionCraft: (missions, action: PayloadAction<string | null>) => {
      missions.craft = action.payload;
    },
  },
});

export const { setMissionTrailsEnabled, setMissionCraft } = missionsSlice.actions;
