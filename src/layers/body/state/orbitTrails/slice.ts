/** orbitTrails — the body Layer's near-field Keplerian orbit-trails singleton overlay. */

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
  },
});

export const { setOrbitTrailsEnabled } = orbitTrailsSlice.actions;
