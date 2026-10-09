/** orbitTrails — core's near-field Keplerian orbit-trails singleton overlay. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const orbitTrailsSlice = createSlice({
  name: 'settings/orbitTrails',
  reducerPath: 'orbitTrails',
  initialState,
  reducers: {
    // Singleton-overlay master gate on the near-field Keplerian orbit trails,
    // its own single writer (like setMilkyWayEnabled / setFilamentsEnabled).
    setOrbitTrailsEnabled: (orbitTrails, action: PayloadAction<boolean>) => {
      orbitTrails.enabled = action.payload;
    },
    // The exhibit timeline's craft switch; the takeover bracket restores it on exit.
    setMissionEmphasis: (orbitTrails, action: PayloadAction<string | null>) => {
      orbitTrails.emphasis = action.payload;
    },
  },
});

export const { setOrbitTrailsEnabled, setMissionEmphasis } = orbitTrailsSlice.actions;
