/**
 * filaments — the filament-skeleton overlay Layer's settings cluster: the
 * master toggle + intensity scale, and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const cosmicWebFilamentsSlice = createSlice({
  name: 'settings/filaments',
  reducerPath: 'filaments',
  initialState,
  reducers: {
    setCosmicWebFilamentsEnabled: (filaments, action: PayloadAction<boolean>) => {
      filaments.enabled = action.payload;
    },
    setCosmicWebFilamentsIntensity: (filaments, action: PayloadAction<number>) => {
      filaments.intensity = action.payload;
    },
  },
});

export const { setCosmicWebFilamentsEnabled, setCosmicWebFilamentsIntensity } = cosmicWebFilamentsSlice.actions;
